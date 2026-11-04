export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankTransactionSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { MATCH_INCLUDE, describeMatch } from '@/lib/banking/candidates';
import { effectiveStatus } from '@/lib/banking/reconciliation';
import { bankTransactionWhere } from '@/lib/banking/transaction-filter';

/**
 * Bank statement lines.
 *
 * The list is what the reconciliation screen reads, so it returns the
 * *effective* status of each row rather than the raw column — see the note on
 * `effectiveStatus` about why the two can differ.
 */

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(Number(searchParams.get('take') ?? DEFAULT_TAKE), 1), MAX_TAKE);
    const skip = Math.max(Number(searchParams.get('skip') ?? 0), 0);

    const bankAccountId = searchParams.get('bankAccountId') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const search = searchParams.get('q')?.trim() ?? '';

    const where = bankTransactionWhere(companyId, { bankAccountId, status, search });

    const [rows, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
          ...MATCH_INCLUDE,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: rows.map((row) => ({
        ...row,
        effectiveStatus: effectiveStatus(row),
        match: describeMatch(row),
      })),
      total,
      take,
      skip,
    });
  } catch (error) {
    return handleApiError('bank-transactions:GET', error, {
      fallbackMessage: 'Failed to load bank transactions',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankTransactionSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const account = await prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, companyId },
      select: { id: true, currency: true },
    });
    if (!account) {
      return NextResponse.json(
        { error: 'Bank account not found or not owned by your company' },
        { status: 404 }
      );
    }

    // A line in a currency the account does not hold could never be reconciled:
    // the matcher requires the currencies to agree, so it would sit unmatched
    // forever with no way for the user to see why.
    const currency = data.currency ?? account.currency;
    if (currency !== account.currency) {
      return NextResponse.json(
        {
          error: `Transaction currency (${currency}) must match the account currency (${account.currency})`,
        },
        { status: 400 }
      );
    }

    const date = parseCalendarDate(data.date);
    if (!date) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

    const created = await prisma.bankTransaction.create({
      data: {
        companyId,
        bankAccountId: account.id,
        date,
        description: data.description,
        amount: data.amount,
        currency,
        direction: data.direction,
        balance: data.balance ?? null,
        reference: data.reference || null,
        externalId: data.externalId || null,
        notes: data.notes || null,
        status: 'UNMATCHED',
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError('bank-transactions:POST', error, {
      conflictMessage: 'This transaction has already been imported',
      fallbackMessage: 'Failed to create bank transaction',
    });
  }
}

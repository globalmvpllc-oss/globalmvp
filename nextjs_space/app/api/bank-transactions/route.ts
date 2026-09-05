export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankTransactionSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { MATCH_INCLUDE, describeMatch } from '@/lib/banking/candidates';
import { UNRECONCILED_WHERE, effectiveStatus } from '@/lib/banking/reconciliation';

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

    const where: Record<string, unknown> = { companyId };
    if (bankAccountId) where.bankAccountId = bankAccountId;

    // "unmatched" is asked as a query about links rather than about the status
    // column, so a row whose matched record was deleted comes back into the
    // queue instead of being hidden as MATCHED forever.
    if (status === 'UNMATCHED') Object.assign(where, UNRECONCILED_WHERE);
    else if (status === 'IGNORED') where.status = 'IGNORED';
    else if (status === 'MATCHED') {
      where.status = { not: 'IGNORED' };
      where.OR = [
        { matchedInvoiceId: { not: null } },
        { matchedPaymentId: { not: null } },
        { matchedIncomeId: { not: null } },
        { matchedExpenseId: { not: null } },
      ];
    }

    if (search) {
      // `where.OR` is only set by the MATCHED branch above, which is mutually
      // exclusive with a search in practice; AND-ing keeps them composable
      // rather than one silently replacing the other.
      const searchClause = [
        { description: { contains: search, mode: 'insensitive' as const } },
        { reference: { contains: search, mode: 'insensitive' as const } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchClause }];
        delete where.OR;
      } else {
        where.OR = searchClause;
      }
    }

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

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankTransactionUpdateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { MATCH_INCLUDE, describeMatch } from '@/lib/banking/candidates';
import { effectiveStatus, matchLinkData } from '@/lib/banking/reconciliation';

async function findOwned(id: string, companyId: string) {
  return prisma.bankTransaction.findFirst({
    where: { id, companyId },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
      ...MATCH_INCLUDE,
    },
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const row = await findOwned(params.id, companyId);
    if (!row) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    return NextResponse.json({ ...row, effectiveStatus: effectiveStatus(row), match: describeMatch(row) });
  } catch (error) {
    return handleApiError('bank-transactions/[id]:GET', error, {
      fallbackMessage: 'Failed to load transaction',
    });
  }
}

/**
 * Corrects a line, or sets it aside.
 *
 * Marking a line IGNORED also clears any match it had. Those two states are
 * mutually exclusive by definition — "this needs no counterpart" and "this is
 * its counterpart" cannot both be true — and leaving a stale link behind would
 * keep the linked record out of the candidate pool for every other line, since
 * candidates.ts excludes anything already reconciled elsewhere.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankTransactionUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const existing = await findOwned(params.id, companyId);
    if (!existing) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    let date: Date | undefined;
    if (data.date !== undefined) {
      const parsed = parseCalendarDate(data.date);
      if (!parsed) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      date = parsed;
    }

    const clearMatch = data.status === 'IGNORED' || data.status === 'UNMATCHED';

    const updated = await prisma.bankTransaction.update({
      where: { id: existing.id },
      data: {
        date,
        description: data.description,
        amount: data.amount,
        direction: data.direction,
        balance: data.balance === undefined ? undefined : data.balance,
        reference: data.reference === undefined ? undefined : data.reference || null,
        notes: data.notes === undefined ? undefined : data.notes || null,
        status: data.status,
        ...(clearMatch ? { ...matchLinkData(null), matchedAt: null, matchConfidence: null } : {}),
      },
      include: {
        bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
        ...MATCH_INCLUDE,
      },
    });

    return NextResponse.json({
      ...updated,
      effectiveStatus: effectiveStatus(updated),
      match: describeMatch(updated),
    });
  } catch (error) {
    return handleApiError('bank-transactions/[id]:PUT', error, {
      notFoundMessage: 'Transaction not found',
      fallbackMessage: 'Failed to update transaction',
    });
  }
}

/**
 * Removes a statement line.
 *
 * Only the bank line goes. Whatever it was reconciled against — an invoice, a
 * payment, an income or expense entry — is untouched: this feature records what
 * the bank says, and deleting that record must never delete the business's own
 * bookkeeping.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.bankTransaction.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    await prisma.bankTransaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('bank-transactions/[id]:DELETE', error, {
      notFoundMessage: 'Transaction not found',
      fallbackMessage: 'Failed to delete transaction',
    });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankAccountUpdateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { UNRECONCILED_WHERE, reconciliationRate } from '@/lib/banking/reconciliation';

/** Reads an account only if it belongs to the caller's company. */
async function findOwnedAccount(id: string, companyId: string) {
  return prisma.bankAccount.findFirst({ where: { id, companyId } });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const account = await findOwnedAccount(params.id, companyId);
    if (!account) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });

    const [total, ignored, unmatched] = await Promise.all([
      prisma.bankTransaction.count({ where: { companyId, bankAccountId: account.id } }),
      prisma.bankTransaction.count({
        where: { companyId, bankAccountId: account.id, status: 'IGNORED' },
      }),
      prisma.bankTransaction.count({
        where: { companyId, bankAccountId: account.id, ...UNRECONCILED_WHERE },
      }),
    ]);
    const matched = Math.max(total - ignored - unmatched, 0);

    return NextResponse.json({
      ...account,
      counts: { total, matched, ignored, unmatched },
      reconciliationRate: reconciliationRate({ matched, ignored, unmatched }),
    });
  } catch (error) {
    return handleApiError('bank-accounts/[id]:GET', error, {
      fallbackMessage: 'Failed to load bank account',
    });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankAccountUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const account = await findOwnedAccount(params.id, companyId);
    if (!account) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });

    // `undefined` means "leave unchanged" to Prisma; `null` means "clear it".
    // Both are distinct from the field simply being absent from the request.
    const updated = await prisma.bankAccount.update({
      where: { id: account.id },
      data: {
        bankName: data.bankName,
        accountName: data.accountName,
        accountNumber: data.accountNumber === undefined ? undefined : data.accountNumber || null,
        iban: data.iban === undefined ? undefined : data.iban || null,
        isActive: data.isActive,
        notes: data.notes === undefined ? undefined : data.notes || null,
        lastBalance: data.lastBalance === undefined ? undefined : data.lastBalance,
        // The "as of" timestamp only moves when the balance itself is written,
        // so a name edit cannot make a stale balance look freshly confirmed.
        lastBalanceAt:
          data.lastBalance === undefined ? undefined : data.lastBalance === null ? null : new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError('bank-accounts/[id]:PUT', error, {
      notFoundMessage: 'Bank account not found',
      fallbackMessage: 'Failed to update bank account',
    });
  }
}

/**
 * Deletes an account and everything imported into it.
 *
 * `ON DELETE CASCADE` removes its BankTransaction rows, which is the right
 * behaviour — a statement line has no meaning without the account it came from.
 * What it does *not* touch is the financial records those lines were reconciled
 * against: invoices, payments, income and expenses are independent, and the
 * link lives on the bank side only.
 *
 * The count is returned so the UI can say what was removed rather than
 * reporting a silent success.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const account = await findOwnedAccount(params.id, companyId);
    if (!account) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });

    const transactionCount = await prisma.bankTransaction.count({
      where: { companyId, bankAccountId: account.id },
    });

    await prisma.bankAccount.delete({ where: { id: account.id } });

    return NextResponse.json({ success: true, deletedTransactions: transactionCount });
  } catch (error) {
    return handleApiError('bank-accounts/[id]:DELETE', error, {
      notFoundMessage: 'Bank account not found',
      fallbackMessage: 'Failed to delete bank account',
    });
  }
}

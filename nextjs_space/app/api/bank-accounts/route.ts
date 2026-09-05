export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankAccountSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { DEFAULT_PROVIDER_ID, getProvider, listProviders } from '@/lib/banking/providers';
import { UNRECONCILED_WHERE } from '@/lib/banking/reconciliation';

/**
 * Bank accounts.
 *
 * Every query is scoped by the company resolved from the session, never by an id
 * taken from the request. That is the tenant boundary — see the note in
 * lib/banking/candidates.ts.
 */

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    // Two reads rather than a per-account count query, which would be one round
    // trip per account.
    const [accounts, unreconciled] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { companyId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.bankTransaction.groupBy({
        by: ['bankAccountId'],
        where: { companyId, ...UNRECONCILED_WHERE },
        _count: { _all: true },
      }),
    ]);

    const outstanding = new Map(unreconciled.map((g) => [g.bankAccountId, g._count._all]));

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        ...account,
        unreconciledCount: outstanding.get(account.id) ?? 0,
        /** Whether this account's provider could pull transactions on its own.
         *  False for every account today; the UI uses it to decide whether to
         *  offer a Sync action at all rather than offering one that does nothing. */
        canSync: getProvider(account.provider)?.canSync ?? false,
      })),
      providers: listProviders().map((p) => ({
        id: p.id,
        label: p.label,
        canSync: p.canSync,
        manualEntry: p.manualEntry,
      })),
    });
  } catch (error) {
    return handleApiError('bank-accounts:GET', error, {
      fallbackMessage: 'Failed to load bank accounts',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankAccountSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    // Validated against the registry rather than an enum, so registering a
    // connector later needs no change here or in lib/validation.ts.
    const providerId = data.provider ?? DEFAULT_PROVIDER_ID;
    const provider = getProvider(providerId);
    if (!provider) {
      return NextResponse.json({ error: `Unknown bank provider "${providerId}"` }, { status: 400 });
    }

    const account = await prisma.bankAccount.create({
      data: {
        companyId,
        bankName: data.bankName,
        accountName: data.accountName,
        accountNumber: data.accountNumber || null,
        iban: data.iban || null,
        currency: data.currency,
        provider: provider.id,
        providerAccountId: data.providerAccountId || null,
        lastBalance: data.lastBalance ?? null,
        // Only stamped when a balance was actually supplied: "as of never" is
        // more honest than "as of now" for an account with no balance.
        lastBalanceAt: data.lastBalance === undefined ? null : new Date(),
        isActive: data.isActive ?? true,
        notes: data.notes || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return handleApiError('bank-accounts:POST', error, {
      conflictMessage: 'This provider account is already connected',
      fallbackMessage: 'Failed to create bank account',
    });
  }
}

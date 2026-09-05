export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankAutoMatchSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { autoMatchTransactions } from '@/lib/banking/auto-match';

/**
 * The "Auto-match" action.
 *
 * Reconciles only what is unambiguous — see the thresholds in
 * lib/banking/matching.ts — and reports how many lines it looked at as well as
 * how many it linked, so "0 of 34 matched" reads as a result rather than as a
 * failure.
 */
export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    // The action is also offered with no body at all, from a plain button.
    const body = await request.json().catch(() => ({}));
    const { data, error } = validateBody(bankAutoMatchSchema, body ?? {});
    if (error) return NextResponse.json(error, { status: 400 });

    if (data.bankAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: data.bankAccountId, companyId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
      }
    }

    const summary = await autoMatchTransactions({
      companyId,
      bankAccountId: data.bankAccountId,
      limit: data.limit,
    });

    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError('bank-transactions/auto-match:POST', error, {
      fallbackMessage: 'Failed to run automatic matching',
    });
  }
}

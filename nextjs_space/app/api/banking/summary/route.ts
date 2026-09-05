export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { MATCH_INCLUDE, describeMatch } from '@/lib/banking/candidates';
import {
  UNRECONCILED_WHERE,
  cashPositionByCurrency,
  effectiveStatus,
  netMovement,
  reconciliationRate,
} from '@/lib/banking/reconciliation';

/**
 * The banking dashboard.
 *
 * Figures are grouped by currency and never converted, matching how
 * /api/dashboard and the reports already present multi-currency totals: this
 * application has no exchange-rate source, and inventing one to produce a single
 * headline number would be fabricating financial data.
 *
 * The cash position is built from what each bank last *reported*, not from
 * summing imported lines. A statement import is often partial, so a derived
 * balance would be confidently wrong; accounts that have never reported one are
 * counted separately so the UI can say the total is incomplete rather than
 * quietly understating it.
 */

/** How far back "recent activity" reaches. */
const RECENT_DAYS = 30;
const RECENT_TAKE = 10;

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const since = new Date();
    since.setDate(since.getDate() - RECENT_DAYS);

    const [accounts, totalCount, ignoredCount, unreconciledCount, recent, movement] =
      await Promise.all([
        prisma.bankAccount.findMany({
          where: { companyId, isActive: true },
          select: {
            id: true,
            bankName: true,
            accountName: true,
            currency: true,
            lastBalance: true,
            lastBalanceAt: true,
            lastSyncedAt: true,
            provider: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.bankTransaction.count({ where: { companyId } }),
        prisma.bankTransaction.count({ where: { companyId, status: 'IGNORED' } }),
        prisma.bankTransaction.count({ where: { companyId, ...UNRECONCILED_WHERE } }),
        prisma.bankTransaction.findMany({
          where: { companyId },
          include: {
            bankAccount: { select: { id: true, bankName: true, accountName: true } },
            ...MATCH_INCLUDE,
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: RECENT_TAKE,
        }),
        prisma.bankTransaction.findMany({
          where: { companyId, date: { gte: since } },
          select: { amount: true, currency: true, direction: true },
        }),
      ]);

    const matchedCount = Math.max(totalCount - ignoredCount - unreconciledCount, 0);

    // Net movement is per currency for the same reason the balances are: adding
    // a TRY line to a USD line produces a number denominated in nothing.
    const movementByCurrency: Record<string, string> = {};
    const currencies = [...new Set(movement.map((m) => m.currency))].sort();
    for (const currency of currencies) {
      movementByCurrency[currency] = netMovement(
        movement
          .filter((m) => m.currency === currency)
          .map((m) => ({ amount: m.amount.toString(), direction: m.direction as 'CREDIT' | 'DEBIT' }))
      ).toFixed(2);
    }

    return NextResponse.json({
      accounts: accounts.map((a) => ({
        ...a,
        lastBalance: a.lastBalance === null ? null : a.lastBalance.toString(),
      })),
      cashPosition: cashPositionByCurrency(
        accounts.map((a) => ({
          currency: a.currency,
          lastBalance: a.lastBalance === null ? null : a.lastBalance.toString(),
        }))
      ),
      counts: {
        total: totalCount,
        matched: matchedCount,
        ignored: ignoredCount,
        unmatched: unreconciledCount,
      },
      reconciliationRate: reconciliationRate({
        matched: matchedCount,
        ignored: ignoredCount,
        unmatched: unreconciledCount,
      }),
      netMovementByCurrency: movementByCurrency,
      movementDays: RECENT_DAYS,
      recent: recent.map((row) => ({
        ...row,
        effectiveStatus: effectiveStatus(row),
        match: describeMatch(row),
      })),
      /** Whether this company has set banking up at all, for the empty state. */
      hasAccounts: accounts.length > 0,
    });
  } catch (error) {
    return handleApiError('banking/summary:GET', error, {
      fallbackMessage: 'Failed to load banking summary',
    });
  }
}

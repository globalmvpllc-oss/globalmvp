import { prisma } from '@/lib/db';
import { loadCandidates } from './candidates';
import { pickAutoMatch } from './matching';
import { UNRECONCILED_WHERE, matchLinkData } from './reconciliation';
import type { BankDirection, MatchTargetType } from './types';

/**
 * Running the automatic matcher over outstanding lines.
 *
 * Separate from the API routes because two of them need it: the import endpoint
 * (opt-in, right after the insert) and the explicit "Auto-match" action.
 *
 * The loop is deliberately sequential rather than a `Promise.all`. Each match
 * removes a record from the candidate pool for every later line — candidates.ts
 * excludes anything already reconciled elsewhere — so running them concurrently
 * would let two bank lines both claim the same invoice, which is precisely the
 * error reconciliation exists to prevent.
 *
 * `pickAutoMatch` decides what is safe to link without asking; everything it
 * declines stays in the queue for a person. See the thresholds in matching.ts.
 */

/** Bounded so one request cannot run unboundedly long. */
export const AUTO_MATCH_DEFAULT_LIMIT = 200;
export const AUTO_MATCH_MAX_LIMIT = 500;

export interface AutoMatchRequest {
  companyId: string;
  /** Restricts the run to one account. */
  bankAccountId?: string;
  limit?: number;
}

export interface AutoMatchSummary {
  /** How many outstanding lines were examined. */
  considered: number;
  /** How many were linked. */
  matched: number;
  /** What was linked, for the response. */
  details: Array<{
    transactionId: string;
    type: MatchTargetType;
    targetId: string;
    label: string;
    score: number;
  }>;
}

export async function autoMatchTransactions(
  request: AutoMatchRequest
): Promise<AutoMatchSummary> {
  const limit = Math.min(Math.max(request.limit ?? AUTO_MATCH_DEFAULT_LIMIT, 1), AUTO_MATCH_MAX_LIMIT);

  const pending = await prisma.bankTransaction.findMany({
    where: {
      companyId: request.companyId,
      ...(request.bankAccountId ? { bankAccountId: request.bankAccountId } : {}),
      ...UNRECONCILED_WHERE,
    },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      currency: true,
      direction: true,
      reference: true,
    },
    orderBy: { date: 'desc' },
    take: limit,
  });

  const summary: AutoMatchSummary = { considered: pending.length, matched: 0, details: [] };

  for (const transaction of pending) {
    const direction = transaction.direction as BankDirection;

    const candidates = await loadCandidates({
      companyId: request.companyId,
      transaction: {
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        direction,
      },
    });

    const best = pickAutoMatch(
      {
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        direction,
        reference: transaction.reference,
      },
      candidates
    );
    if (!best) continue;

    try {
      await prisma.bankTransaction.update({
        where: { id: transaction.id },
        data: {
          ...matchLinkData({ type: best.type, id: best.id }),
          status: 'MATCHED',
          matchedAt: new Date(),
          // Recorded so the reconciliation screen can distinguish a machine's
          // judgement from a person's and show what it was based on.
          matchConfidence: best.score,
        },
      });
    } catch {
      // The target may have been deleted between the candidate read and the
      // write, which surfaces as a foreign-key failure. One line failing to
      // match is not a reason to abandon the rest of the run; it simply stays
      // in the queue.
      continue;
    }

    summary.matched += 1;
    summary.details.push({
      transactionId: transaction.id,
      type: best.type,
      targetId: best.id,
      label: best.label,
      score: best.score,
    });
  }

  return summary;
}

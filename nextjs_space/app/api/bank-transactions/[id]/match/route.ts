export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankMatchSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import {
  MATCH_INCLUDE,
  describeMatch,
  loadCandidates,
  verifyMatchTarget,
} from '@/lib/banking/candidates';
import { AMOUNT_TOLERANCE, MAX_SUGGESTIONS, rankCandidates } from '@/lib/banking/matching';
import { effectiveStatus, matchLinkData } from '@/lib/banking/reconciliation';
import type { BankDirection } from '@/lib/banking/types';

/**
 * Reconciling one bank line.
 *
 *   GET    — ranked suggestions
 *   POST   — link it to a chosen record
 *   DELETE — unlink it
 *
 * The important property is that POST re-verifies everything rather than
 * trusting the client. A suggestion list is a convenience; the checks below are
 * what actually decide whether a link may be made, so a hand-crafted request
 * cannot create a pairing the matcher would have refused.
 */

async function findOwned(id: string, companyId: string) {
  return prisma.bankTransaction.findFirst({
    where: { id, companyId },
    include: MATCH_INCLUDE,
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const transaction = await findOwned(params.id, companyId);
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const candidates = await loadCandidates({
      companyId,
      transaction: {
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        direction: transaction.direction as BankDirection,
      },
    });

    const ranked = rankCandidates(
      {
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        direction: transaction.direction as BankDirection,
        reference: transaction.reference,
      },
      candidates
    );

    return NextResponse.json({ suggestions: ranked.slice(0, MAX_SUGGESTIONS) });
  } catch (error) {
    return handleApiError('bank-transactions/[id]/match:GET', error, {
      fallbackMessage: 'Failed to load suggestions',
    });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankMatchSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const transaction = await findOwned(params.id, companyId);
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    // Ownership of the *target* is checked here, scoped by the same companyId.
    // Skipping this would let a request name another business's invoice id and
    // pull that record into this company's reconciliation view.
    const target = await verifyMatchTarget(companyId, data.type, data.targetId, transaction.id);
    if (!target) {
      return NextResponse.json(
        { error: 'That record was not found, or it is already reconciled against another transaction' },
        { status: 404 }
      );
    }

    // The same three hard rules the matcher applies, restated where it counts.
    // A person may reasonably override a low score; none of these is a matter of
    // confidence, so none of them may be overridden.
    if (target.currency !== transaction.currency) {
      return NextResponse.json(
        {
          error: `Currencies do not match: the bank line is in ${transaction.currency}, that record is in ${target.currency}`,
        },
        { status: 400 }
      );
    }

    if (target.direction !== transaction.direction) {
      const moneyIn = transaction.direction === 'CREDIT';
      return NextResponse.json(
        {
          error: moneyIn
            ? 'This bank line is money coming in, so it cannot be matched to a payment out'
            : 'This bank line is money going out, so it cannot be matched to money received',
        },
        { status: 400 }
      );
    }

    const bankAmount = new Decimal(transaction.amount.toString());
    if (bankAmount.minus(target.amount).abs().gt(AMOUNT_TOLERANCE)) {
      return NextResponse.json(
        {
          error: `Amounts do not match: the bank line is ${bankAmount.toFixed(2)}, that record is ${target.amount.toFixed(2)}`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        ...matchLinkData({ type: data.type, id: data.targetId }),
        status: 'MATCHED',
        matchedAt: new Date(),
        // Null records "a person chose this", as distinct from a score the
        // automatic matcher produced.
        matchConfidence: null,
      },
      include: MATCH_INCLUDE,
    });

    return NextResponse.json({
      ...updated,
      effectiveStatus: effectiveStatus(updated),
      match: describeMatch(updated),
    });
  } catch (error) {
    return handleApiError('bank-transactions/[id]/match:POST', error, {
      notFoundMessage: 'Transaction not found',
      fallbackMessage: 'Failed to match transaction',
    });
  }
}

/** Undoes a match, returning the line to the queue. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const updated = await prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        ...matchLinkData(null),
        status: 'UNMATCHED',
        matchedAt: null,
        matchConfidence: null,
      },
      include: MATCH_INCLUDE,
    });

    return NextResponse.json({
      ...updated,
      effectiveStatus: effectiveStatus(updated),
      match: describeMatch(updated),
    });
  } catch (error) {
    return handleApiError('bank-transactions/[id]/match:DELETE', error, {
      notFoundMessage: 'Transaction not found',
      fallbackMessage: 'Failed to unmatch transaction',
    });
  }
}

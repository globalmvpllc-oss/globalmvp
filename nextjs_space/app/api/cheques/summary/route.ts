export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { buildChequeTotals } from '@/lib/cheque-totals';
import { isChequeDirection } from '@/lib/cheque-status';

/**
 * What is held, what falls due next, and what bounced — per currency.
 *
 * The rows are read and folded by `lib/cheque-totals.ts` rather than aggregated
 * in SQL, because "due in the next 30 days" is a window in the company's own
 * time zone and Postgres would need that zone pushed into the query to answer
 * it. Folding a portfolio of instruments in memory is cheap; getting the
 * boundary wrong is the bug this codebase has already had twice.
 *
 * Only the five columns the totals need are selected, so the payload stays
 * small whatever the drawer holds.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const direction = new URL(request.url).searchParams.get('direction');

    const [company, rows] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { defaultCurrency: true, timezone: true },
      }),
      prisma.chequeInstrument.findMany({
        where: { companyId },
        select: { direction: true, status: true, currency: true, amount: true, dueDate: true },
      }),
    ]);

    return NextResponse.json(
      buildChequeTotals({
        rows,
        defaultCurrency: company?.defaultCurrency ?? 'USD',
        direction: isChequeDirection(direction) ? direction : null,
        timeZone: company?.timezone,
      })
    );
  } catch (error) {
    return handleApiError('cheques:GET:summary', error, {
      fallbackMessage: 'Failed to load the portfolio totals',
    });
  }
}

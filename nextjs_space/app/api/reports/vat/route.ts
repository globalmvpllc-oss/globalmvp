export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { vatPeriod } from '@/lib/vat-report';
import { loadVatReport } from '@/lib/vat-report-data';

/**
 * KDV report for the session's company. ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * (both inclusive); defaults to the current month.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const period = vatPeriod(searchParams.get('from'), searchParams.get('to'));
    if (!period) {
      return NextResponse.json({ error: 'Use dates such as 2026-11-01', code: 'BAD_PERIOD' }, { status: 400 });
    }
    const report = await loadVatReport(companyId, period);
    return NextResponse.json({ from: period.from, to: period.to, ...report });
  } catch (error) {
    return handleApiError('reports:vat', error, { fallbackMessage: 'The VAT report could not be prepared.' });
  }
}

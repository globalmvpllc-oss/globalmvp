export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getCurrentPlan } from '@/lib/billing/limits';
import { CAPABILITIES, planDelivers } from '@/lib/billing/features';
import { getServerLocale } from '@/lib/i18n/server';
import { vatPeriod } from '@/lib/vat-report';
import { buildCsv, buildXlsx } from '@/lib/export/tabular';
import { buildExportTables, isExportDataset } from '@/lib/export/datasets';

/**
 * Excel / CSV export: GET /api/export/{dataset}?format=xlsx|csv&from&to
 *
 * - Company-scoped: the company comes from the session only.
 * - Plan-gated server-side by the `dataExport` capability (the pricing page
 *   reads the same definition), not just hidden in the UI.
 * - from/to (inclusive calendar dates) narrow transactional datasets; the
 *   VAT report defaults to the current month.
 */
export async function GET(request: Request, { params }: { params: { dataset: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    if (!isExportDataset(params.dataset)) {
      return NextResponse.json({ error: 'Unknown dataset' }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';

    const capability = CAPABILITIES.find((c) => c.id === 'dataExport')!;
    const plan = await getCurrentPlan(companyId);
    if (!planDelivers(plan, capability)) {
      return NextResponse.json(
        { error: 'Data export is part of the Pro plan.', code: 'FEATURE_NOT_IN_PLAN', feature: 'dataExport', plan },
        { status: 402 }
      );
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    let period: { gte?: Date; lt?: Date; from?: string; to?: string } = {};
    if (from || to || params.dataset === 'vat') {
      // Only the VAT report defaults to the current month. For lists a missing
      // bound means "from the beginning" / "up to now and later".
      const parsed =
        params.dataset === 'vat' ? vatPeriod(from, to) : vatPeriod(from ?? '1900-01-01', to ?? '9999-12-30');
      if (!parsed) return NextResponse.json({ error: 'Use dates such as 2026-11-01', code: 'BAD_PERIOD' }, { status: 400 });
      period = parsed;
    }

    const locale = getServerLocale();
    const tables = await buildExportTables(params.dataset, companyId, locale, period);
    const stamp = new Date().toISOString().slice(0, 10);
    // The file name shows the dates the user asked for, never the open-ended stand-ins.
    const span =
      params.dataset === 'vat' && period.from && period.to
        ? `${period.from}_${period.to}`
        : from || to
          ? `${from ?? 'start'}_${to ?? stamp}`
          : stamp;
    const base = `corpcontrol-${params.dataset}-${span}`;

    if (format === 'csv') {
      return new Response(buildCsv(tables[0], locale), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${base}.csv"`,
          'Cache-Control': 'private, no-store, max-age=0',
        },
      });
    }
    return new Response(Buffer.from(buildXlsx(tables)), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return handleApiError('export', error, { fallbackMessage: 'The export could not be prepared.' });
  }
}

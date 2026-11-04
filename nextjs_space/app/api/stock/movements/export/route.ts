export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { translate, type TranslationKey } from '@/lib/i18n';
import { buildXlsx } from '@/lib/export/tabular';
import { renderBusinessDocumentPdf } from '@/lib/pdf/engine';
import { pdfResponse } from '@/lib/pdf/response';
import { requireStockActor } from '@/lib/stock/actor';
import { stockLocale } from '@/lib/stock/alerts';
import { startOfStockDay } from '@/lib/stock/service';
import { XLSX_TYPE } from '@/lib/stock/data';

const MAX = 5000;

/**
 * GET ?format=pdf|xlsx&productId=&staffId=&from=&to=&today=1 — the movement
 * history as PDF (the in-house engine) or Excel, with the screen's filter.
 * Removed products keep their name here. Manager and accountant.
 */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('export');
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });
    const where: Record<string, unknown> = { companyId: actor.companyId };
    if (searchParams.get('productId')) where.productId = searchParams.get('productId');
    if (searchParams.get('staffId')) where.actorStaffId = searchParams.get('staffId');
    if (searchParams.get('today') === '1') where.createdAt = { gte: startOfStockDay() };
    else if (range) where.createdAt = range;

    const [rows, company] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { code: true, name: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX,
      }),
      prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true, country: true, primaryColor: true } }),
    ]);
    const locale = stockLocale(company?.country);
    const t = (k: TranslationKey) => translate(locale, k);
    const when = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const qty = (n: unknown) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(Number(n));
    const cells = rows.map((m) => [
      when.format(m.createdAt),
      m.product.code,
      m.product.name,
      `${Number(m.delta) > 0 ? '+' : ''}${qty(m.delta)} ${m.product.unit}`,
      qty(m.quantityAfter),
      t(`ks.reason.${m.reason}` as TranslationKey) + (m.undoneAt ? ` (${t('ks.mv.undone')})` : ''),
      m.actorName,
      m.note ?? '',
    ]);
    const stamp = new Date().toISOString().slice(0, 10);

    if (searchParams.get('format') === 'xlsx') {
      const bytes = buildXlsx([
        {
          name: t('ks.mv.title'),
          columns: [t('ks.mv.when'), t('ks.product.code'), t('ks.product.name'), t('ks.mv.qty'), t('ks.product.stock'), t('ks.mv.reason'), t('ks.mv.who'), t('ks.qty.note')].map((header) => ({ header })),
          rows: cells,
        },
      ]);
      return new Response(Buffer.from(bytes), {
        headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="kolaystok-hareketler-${stamp}.xlsx"`, 'Cache-Control': 'private, no-store' },
      });
    }

    const pdf = await renderBusinessDocumentPdf({
      title: t('ks.mv.title').toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US'),
      brandColor: company?.primaryColor,
      issuer: { name: company?.name ?? '', lines: [t('ks.brand')] },
      party: null,
      meta: [
        { label: t('listPdf.generatedAt'), value: when.format(new Date()) },
        { label: t('listPdf.recordCount'), value: String(rows.length) },
      ],
      blocks: [
        {
          kind: 'table',
          columns: [
            { label: t('ks.mv.when'), width: 16 },
            { label: t('ks.product.code'), width: 11 },
            { label: t('ks.product.name'), width: 27 },
            { label: t('ks.mv.qty'), width: 12, align: 'right' },
            { label: t('ks.mv.reason'), width: 16 },
            { label: t('ks.mv.who'), width: 18 },
          ],
          rows: cells.map((c) => ({ cells: [c[0], c[1], c[2], c[3], c[5], c[6]], detail: undefined })),
          emptyText: t('ks.mv.empty'),
        },
      ],
      footer: company?.name ?? '',
      pageLabel: translate(locale, 'pdf.page'),
    });
    return pdfResponse(pdf, `kolaystok-hareketler-${stamp}.pdf`);
  } catch (error) {
    return handleApiError('stock:movements:export', error, { fallbackMessage: 'Could not prepare the file.' });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { importTemplate } from '@/lib/stock/excel';
import { stockLocale } from '@/lib/stock/alerts';
import { XLSX_TYPE } from '@/lib/stock/data';
import { applyImport, checkImportFile, uploadedFile } from '@/lib/stock/import';
import { SpreadsheetTooLargeError } from '@/lib/stock/karadag-import';

/** GET — the Excel template (manager). */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { country: true } });
    return new Response(Buffer.from(importTemplate(stockLocale(company?.country))), {
      headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': 'attachment; filename="kolaystok-sablon.xlsx"', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError('stock:import:template', error, { fallbackMessage: 'Could not prepare the template.' });
  }
}

/**
 * POST (multipart: file, mode=preview|apply) — bulk add / update.
 *
 * preview: reads the file and reports every row (create / update / errors);
 *          nothing is written.
 * apply:   the same file is read and checked again on the server, and is
 *          applied only if no row has an error — the client's preview is
 *          never trusted.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const mode = new URL(request.url).searchParams.get('mode') === 'apply' ? 'apply' : 'preview';
    const file = await uploadedFile(request);
    if (file === 'TOO_BIG') return NextResponse.json({ error: 'The file is too large (10 MB).', code: 'TOO_BIG' }, { status: 413 });
    if (!file) return NextResponse.json({ error: 'Choose an Excel file.', code: 'NO_FILE' }, { status: 400 });

    let checked;
    try {
      checked = await checkImportFile(actor.companyId, file);
    } catch (error) {
      if (error instanceof SpreadsheetTooLargeError) {
        return NextResponse.json({ error: 'The file is too large once unpacked.', code: 'TOO_BIG' }, { status: 413 });
      }
      return NextResponse.json({ error: 'This file could not be read.', code: 'UNREADABLE' }, { status: 400 });
    }
    if (mode === 'preview') return NextResponse.json(checked);
    if (checked.errorCount > 0) return NextResponse.json({ ...checked, error: 'Fix the rows with errors first.', code: 'HAS_ERRORS' }, { status: 409 });
    const result = await applyImport(actor, checked.rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError('stock:import', error, { fallbackMessage: 'Could not import.' });
  }
}

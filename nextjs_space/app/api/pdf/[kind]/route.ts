export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getServerLocale } from '@/lib/i18n/server';
import { isListPdfKind, listPdfFileName, renderListPdf } from '@/lib/pdf/list-pdf';
import { loadListDocument } from '@/lib/pdf/list-data';
import { loadDocumentCompany, pdfResponse } from '@/lib/pdf/response';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/**
 * List and report PDFs: GET /api/pdf/{kind}?<the screen's filter>
 *
 * - Company-scoped: the company comes from the session only.
 * - The query string carries the same filter the list screen sends to its
 *   own API (status, direction, bankAccountId, q, from, to), so the PDF
 *   shows what the user is looking at.
 * - Not counted against the monthly PDF allowance: these are read-outs of the
 *   company's own records, like the screens themselves. `enforcePlanLimit` is
 *   deliberately not called here.
 */
export async function GET(request: Request, { params }: { params: { kind: string } }) {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    const { companyId } = auth;

    if (!isListPdfKind(params.kind)) {
      return NextResponse.json({ error: 'Unknown document' }, { status: 404 });
    }

    const locale = getServerLocale();
    const { searchParams } = new URL(request.url);
    const loaded = await loadListDocument(params.kind, companyId, locale, searchParams);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error, ...(loaded.code ? { code: loaded.code } : {}) }, { status: loaded.status });
    }

    const company = await loadDocumentCompany(companyId);
    const now = new Date();
    const bytes = await renderListPdf({
      kind: params.kind,
      locale,
      company,
      filters: loaded.filters,
      body: loaded.body,
      truncatedAt: loaded.truncatedAt,
      generatedAt: now,
    });
    await recordAccountantDownload(auth, request, { kind: 'list-pdf', id: params.kind });
    return pdfResponse(bytes, listPdfFileName(params.kind, now));
  } catch (error) {
    return handleApiError('pdf:list', error, { fallbackMessage: 'The PDF could not be prepared.' });
  }
}

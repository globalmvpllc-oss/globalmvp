export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { pdfResponse } from '@/lib/pdf/response';
import { loadStockQuote, quoteHasVat, renderStockQuotePdf } from '@/lib/stock/quotes';
import { invoicePdfFileName } from '@/lib/pdf/invoice-pdf';

/** GET — download a KolayStok quote's PDF again (this company's only). */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const quote = await loadStockQuote(actor.companyId, params.id);
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pdf = await renderStockQuotePdf(actor.companyId, quote, quoteHasVat(quote));
    return pdfResponse(pdf, invoicePdfFileName(quote.quoteNumber));
  } catch (error) {
    return handleApiError('stock:quotes:pdf', error, { fallbackMessage: 'Could not prepare the PDF.' });
  }
}

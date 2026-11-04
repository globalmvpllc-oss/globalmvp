export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { renderInvoicePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany, pdfResponse } from '@/lib/pdf/response';

/**
 * The invoice as a PDF, built on the server from the stored invoice.
 *
 * Replaces the old HTML → external service flow: nothing the browser sends is
 * rendered, only the record this company owns (scoped by session companyId).
 * The monthly PDF allowance is enforced exactly as before.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId },
      include: { items: true, customer: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const denied = await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const company = await loadDocumentCompany(companyId);
    const bytes = await renderInvoicePdf(invoice, company);
    return pdfResponse(bytes, invoicePdfFileName(invoice.invoiceNumber));
  } catch (error) {
    return handleApiError('invoices:pdf', error, { fallbackMessage: 'The PDF could not be prepared.' });
  }
}

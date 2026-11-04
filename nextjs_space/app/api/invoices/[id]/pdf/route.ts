export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { renderInvoicePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany, pdfResponse } from '@/lib/pdf/response';
import { isAccountant } from '@/lib/accountant/rules';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/**
 * The invoice as a PDF, built on the server from the stored invoice.
 *
 * Replaces the old HTML → external service flow: nothing the browser sends is
 * rendered, only the record this company owns (scoped by session companyId).
 * The monthly PDF allowance is enforced exactly as before.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    const { companyId, role } = auth;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId },
      include: { items: true, customer: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // An accountant's downloads never use the company's PDF allowance.
    const denied = isAccountant(role) ? null : await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const company = await loadDocumentCompany(companyId);
    const bytes = await renderInvoicePdf(invoice, company);
    await recordAccountantDownload(auth, request, { kind: 'invoice-pdf', id: params.id });
    return pdfResponse(bytes, invoicePdfFileName(invoice.invoiceNumber));
  } catch (error) {
    return handleApiError('invoices:pdf', error, { fallbackMessage: 'The PDF could not be prepared.' });
  }
}

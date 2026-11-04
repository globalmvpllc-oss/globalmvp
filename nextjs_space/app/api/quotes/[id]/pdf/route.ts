export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { renderQuotePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany, pdfResponse } from '@/lib/pdf/response';
import { isAccountant } from '@/lib/accountant/rules';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/** The quote as a PDF, from the stored record. Counts toward the monthly PDF allowance. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    const { companyId, role } = auth;

    const quote = await prisma.quote.findFirst({
      where: { id: params.id, companyId },
      include: { items: { orderBy: { id: 'asc' } }, customer: true },
    });
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // An accountant's downloads never use the company's PDF allowance.
    const denied = isAccountant(role) ? null : await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const company = await loadDocumentCompany(companyId);
    const bytes = await renderQuotePdf(quote, company);
    await recordAccountantDownload(auth, request, { kind: 'quote-pdf', id: params.id });
    return pdfResponse(bytes, invoicePdfFileName(quote.quoteNumber));
  } catch (error) {
    return handleApiError('quotes:pdf', error, { fallbackMessage: 'The PDF could not be prepared.' });
  }
}

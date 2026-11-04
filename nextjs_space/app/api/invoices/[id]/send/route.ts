export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { checkRateLimit } from '@/lib/rate-limit';
import { renderInvoicePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany } from '@/lib/pdf/response';
import { sendMail, isMailConfigured } from '@/lib/email/mailer';
import { invoiceEmail } from '@/lib/email/templates';
import { documentLocaleFor } from '@/lib/tr-tax';
import { canTransition } from '@/lib/invoice-status';

/** Twenty invoice emails per company per hour is plenty, and stops a loop. */
const SEND_RULE = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * Emails an invoice to its customer with the PDF attached.
 *
 * - Only the caller's own company's invoice (scoped by session companyId).
 * - Only to the address stored on the customer — never one from the request.
 * - Nothing is sent unless the PDF was produced; the response says why.
 * - A DRAFT becomes SENT; resending an issued invoice keeps its status.
 * - The send is written to the audit log ("invoice.emailed").
 *
 * Errors carry a `code` so the page can show them in the reader's language.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, user, companyId } = await requireUserCompany();
    if (error) return error;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId },
      include: { items: true, customer: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'A cancelled invoice cannot be emailed.', code: 'CANCELLED' },
        { status: 409 }
      );
    }
    const to = invoice.customer?.email?.trim();
    if (!to) {
      return NextResponse.json(
        { error: 'This customer has no email address.', code: 'NO_EMAIL' },
        { status: 400 }
      );
    }
    if (!isMailConfigured()) {
      return NextResponse.json(
        { error: 'Email sending is not configured.', code: 'NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    const limited = checkRateLimit(`invoice-email:${companyId}`, SEND_RULE);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: 'Too many emails. Please wait a few minutes.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }

    // The PDF counts against the same monthly allowance as a PDF download.
    const denied = await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const company = await loadDocumentCompany(companyId);
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Built here by the in-house PDF engine; no external service.
    let pdf: Uint8Array | null = null;
    try {
      pdf = await renderInvoicePdf(invoice, company);
    } catch (pdfError) {
      console.error('[invoices:send] pdf failed', { name: (pdfError as { name?: string })?.name });
    }
    if (!pdf) {
      return NextResponse.json(
        { error: 'The PDF could not be prepared, so nothing was sent.', code: 'PDF_FAILED' },
        { status: 502 }
      );
    }

    const locale = documentLocaleFor(invoice.customer, company);
    const email = invoiceEmail({
      locale,
      companyName: company.name,
      customerName: invoice.customer.name,
      invoiceNumber: invoice.invoiceNumber,
      amountDue: Number(invoice.total) - Number(invoice.amountPaid),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
    });
    const result = await sendMail({
      to,
      ...email,
      replyTo: company.email,
      senderName: company.name,
      attachments: [{ filename: invoicePdfFileName(invoice.invoiceNumber), content: Buffer.from(pdf) }],
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'The email could not be sent.', code: result.reason === 'not_configured' ? 'NOT_CONFIGURED' : 'SEND_FAILED' },
        { status: 502 }
      );
    }

    const now = new Date();
    const nextStatus = invoice.status === 'DRAFT' && canTransition('DRAFT', 'SENT') ? 'SENT' : invoice.status;
    // Scoped by companyId, and the DRAFT → SENT move only if it is still a draft.
    await prisma.invoice.updateMany({
      where: { id: invoice.id, companyId },
      data: { sentAt: now },
    });
    if (nextStatus !== invoice.status) {
      await prisma.invoice.updateMany({
        where: { id: invoice.id, companyId, status: 'DRAFT' },
        data: { status: 'SENT' },
      });
    }

    // Best effort: a failed log write must not turn a sent email into an error.
    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          actorEmail: user.email ?? '',
          action: 'invoice.emailed',
          entityType: 'invoice',
          entityId: invoice.id,
          companyId,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            to,
            locale,
            statusBefore: invoice.status,
            statusAfter: nextStatus,
            messageId: result.id,
          },
        },
      });
    } catch (logError) {
      console.error('[invoices:send] audit write failed', { code: (logError as { code?: string })?.code });
    }

    return NextResponse.json({ ok: true, to, status: nextStatus, sentAt: now.toISOString() });
  } catch (error) {
    return handleApiError('invoices:send', error, { fallbackMessage: 'The email could not be sent.' });
  }
}

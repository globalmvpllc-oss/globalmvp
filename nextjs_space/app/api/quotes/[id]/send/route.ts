export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { checkRateLimit } from '@/lib/rate-limit';
import { renderQuotePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany } from '@/lib/pdf/response';
import { sendMail, isMailConfigured } from '@/lib/email/mailer';
import { quoteEmail } from '@/lib/email/templates';
import { documentLocaleFor } from '@/lib/tr-tax';

const SEND_RULE = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * Emails a quote to its customer with the PDF attached. Same rules as the
 * invoice email: stored address only, nothing sent without the PDF, a DRAFT
 * becomes SENT, the send is written to the audit log ("quote.emailed").
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, user, companyId } = await requireUserCompany();
    if (error) return error;

    const quote = await prisma.quote.findFirst({
      where: { id: params.id, companyId },
      include: { items: true, customer: true },
    });
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (quote.status === 'REJECTED') {
      return NextResponse.json({ error: 'A rejected quote cannot be emailed.', code: 'REJECTED' }, { status: 409 });
    }
    const to = quote.customer?.email?.trim();
    if (!to) return NextResponse.json({ error: 'This customer has no email address.', code: 'NO_EMAIL' }, { status: 400 });
    if (!isMailConfigured()) {
      return NextResponse.json({ error: 'Email sending is not configured.', code: 'NOT_CONFIGURED' }, { status: 503 });
    }
    const limited = checkRateLimit(`quote-email:${companyId}`, SEND_RULE);
    if (!limited.allowed) {
      return NextResponse.json({ error: 'Too many emails.', code: 'RATE_LIMITED' }, { status: 429 });
    }
    const denied = await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const company = await loadDocumentCompany(companyId);
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    let pdf: Uint8Array | null = null;
    try {
      pdf = await renderQuotePdf(quote, company);
    } catch (pdfError) {
      console.error('[quotes:send] pdf failed', { name: (pdfError as { name?: string })?.name });
    }
    if (!pdf) {
      return NextResponse.json({ error: 'The PDF could not be prepared, so nothing was sent.', code: 'PDF_FAILED' }, { status: 502 });
    }

    const locale = documentLocaleFor(quote.customer, company);
    const result = await sendMail({
      to,
      ...quoteEmail({
        locale,
        companyName: company.name,
        customerName: quote.customer.name,
        quoteNumber: quote.quoteNumber,
        total: quote.total,
        currency: quote.currency,
        validUntil: quote.validUntil,
      }),
      replyTo: company.email,
      senderName: company.name,
      attachments: [{ filename: invoicePdfFileName(quote.quoteNumber), content: Buffer.from(pdf) }],
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'The email could not be sent.', code: result.reason === 'not_configured' ? 'NOT_CONFIGURED' : 'SEND_FAILED' },
        { status: 502 }
      );
    }

    const now = new Date();
    await prisma.quote.updateMany({ where: { id: quote.id, companyId }, data: { sentAt: now } });
    if (quote.status === 'DRAFT') {
      await prisma.quote.updateMany({ where: { id: quote.id, companyId, status: 'DRAFT' }, data: { status: 'SENT' } });
    }
    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          actorEmail: user.email ?? '',
          action: 'quote.emailed',
          entityType: 'quote',
          entityId: quote.id,
          companyId,
          metadata: { quoteNumber: quote.quoteNumber, to, locale, messageId: result.id },
        },
      });
    } catch (logError) {
      console.error('[quotes:send] audit write failed', { code: (logError as { code?: string })?.code });
    }
    return NextResponse.json({ ok: true, to, status: quote.status === 'DRAFT' ? 'SENT' : quote.status, sentAt: now.toISOString() });
  } catch (error) {
    return handleApiError('quotes:send', error, { fallbackMessage: 'The email could not be sent.' });
  }
}

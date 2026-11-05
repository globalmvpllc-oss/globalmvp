export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { sendMail, isMailConfigured } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireStockActor } from '@/lib/stock/actor';
import { draftQuote, quoteInputSchema, quoteMail, renderStockQuotePdf, saveQuote } from '@/lib/stock/quotes';

const DRAFT_STATUS = { CUSTOMER_NOT_FOUND: 404, NO_EMAIL: 400, NO_LINES: 400 } as const;

/** GET — KolayStok quotes, newest first (number, customer, total, status, valid until), and the last VAT choice. */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const settings = await prisma.stockSettings.findUnique({ where: { companyId: actor.companyId }, select: { quoteAddVat: true } });
    const rows = await prisma.quote.findMany({
      where: { companyId: actor.companyId, source: 'kolaystok' },
      select: { id: true, quoteNumber: true, status: true, total: true, currency: true, issueDate: true, validUntil: true, sentAt: true, stockDeductedAt: true, customer: { select: { name: true, companyName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({
      // The company's last "KDV %20 ekle" choice, for the next quote.
      addVat: settings?.quoteAddVat ?? false,
      quotes: rows.map((q) => ({ ...q, total: Number(q.total) })),
    });
  } catch (error) {
    return handleApiError('stock:quotes:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/**
 * POST { customerId, lines, addVat, validDays, note, confirmed: true } — save
 * the quote the manager has just previewed and email it with its PDF.
 * Never sent without that explicit press. Stock does not change.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const body = await request.json().catch(() => null);
    if (body?.confirmed !== true) return NextResponse.json({ error: 'Confirm first.', code: 'NOT_CONFIRMED' }, { status: 400 });
    const parsed = quoteInputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Check the quote.', code: 'INVALID' }, { status: 400 });
    if (!isMailConfigured()) return NextResponse.json({ error: 'Email sending is not configured.', code: 'NOT_CONFIGURED' }, { status: 503 });
    const limit = checkRateLimit(`ks-quote:${actor.companyId}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many emails.', code: 'RATE_LIMITED' }, { status: 429 });
    const denied = await enforcePlanLimit(actor.companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const draft = await draftQuote(actor.companyId, parsed.data);
    if (draft.error) return NextResponse.json({ error: draft.error, code: draft.error }, { status: DRAFT_STATUS[draft.error] });
    const quote = await saveQuote(actor.companyId, draft);

    const pdf = await renderStockQuotePdf(actor.companyId, quote, draft.addVat);
    const mail = await quoteMail(actor.companyId, quote);
    const result = await sendMail({
      to: mail.to,
      ...mail.email,
      fromEmail: mail.from,
      senderName: mail.companyName,
      replyTo: mail.replyTo,
      attachments: [{ filename: mail.fileName, content: Buffer.from(pdf) }],
    });
    if (!result.ok) {
      // Saved as a draft: it shows in "Teklifler" and can be sent again from there.
      return NextResponse.json({ error: 'The email could not be sent.', code: 'SEND_FAILED', id: quote.id, quoteNumber: quote.quoteNumber }, { status: 502 });
    }
    await prisma.quote.updateMany({ where: { id: quote.id, companyId: actor.companyId }, data: { status: 'SENT', sentAt: new Date() } });
    return NextResponse.json({ id: quote.id, quoteNumber: quote.quoteNumber, to: mail.to }, { status: 201 });
  } catch (error) {
    return handleApiError('stock:quotes:POST', error, { fallbackMessage: 'Could not send the quote.' });
  }
}

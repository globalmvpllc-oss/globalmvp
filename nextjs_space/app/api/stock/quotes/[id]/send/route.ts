export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { sendMail, isMailConfigured } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireStockActor } from '@/lib/stock/actor';
import { loadStockQuote, quoteHasVat, quoteMail, renderStockQuotePdf } from '@/lib/stock/quotes';

/** POST { confirmed: true } — email a KolayStok quote again with its PDF. Stock does not change. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const body = await request.json().catch(() => null);
    if (body?.confirmed !== true) return NextResponse.json({ error: 'Confirm first.', code: 'NOT_CONFIRMED' }, { status: 400 });
    if (!isMailConfigured()) return NextResponse.json({ error: 'Email sending is not configured.', code: 'NOT_CONFIGURED' }, { status: 503 });
    const limit = checkRateLimit(`ks-quote:${actor.companyId}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many emails.', code: 'RATE_LIMITED' }, { status: 429 });
    const quote = await loadStockQuote(actor.companyId, params.id);
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (quote.status === 'REJECTED') return NextResponse.json({ error: 'A rejected quote cannot be sent.', code: 'REJECTED' }, { status: 409 });
    if (!quote.customer.email) return NextResponse.json({ error: 'No email.', code: 'NO_EMAIL' }, { status: 400 });
    const pdf = await renderStockQuotePdf(actor.companyId, quote, quoteHasVat(quote));
    const mail = await quoteMail(actor.companyId, quote);
    const result = await sendMail({
      to: mail.to,
      ...mail.email,
      fromEmail: mail.from,
      senderName: mail.companyName,
      replyTo: mail.replyTo,
      attachments: [{ filename: mail.fileName, content: Buffer.from(pdf) }],
    });
    if (!result.ok) return NextResponse.json({ error: 'The email could not be sent.', code: 'SEND_FAILED' }, { status: 502 });
    await prisma.quote.updateMany({ where: { id: quote.id, companyId: actor.companyId }, data: { sentAt: new Date() } });
    await prisma.quote.updateMany({ where: { id: quote.id, companyId: actor.companyId, status: 'DRAFT' }, data: { status: 'SENT' } });
    return NextResponse.json({ ok: true, to: mail.to });
  } catch (error) {
    return handleApiError('stock:quotes:send', error, { fallbackMessage: 'Could not send.' });
  }
}

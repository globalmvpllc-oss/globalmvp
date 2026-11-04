export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { sendMail } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireStockActor } from '@/lib/stock/actor';
import { buildOrderEmail, orderSchema } from '@/lib/stock/orders';

const STATUS = { VENDOR_NOT_FOUND: 404, NO_EMAIL: 400, NO_LINES: 400 } as const;

/**
 * POST { vendorId, lines, note, confirmed: true } — send the order the
 * manager has just previewed. Only ever called by that explicit press;
 * nothing in KolayStok sends an order by itself. Each address gets one email.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('order.email');
    if (error) return error;
    const body = await request.json().catch(() => null);
    if (body?.confirmed !== true) return NextResponse.json({ error: 'Confirm first.', code: 'NOT_CONFIRMED' }, { status: 400 });
    const limit = checkRateLimit(`ks-order:${actor.companyId}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many emails.', code: 'RATE_LIMITED' }, { status: 429 });
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Check the quantities.', code: 'INVALID' }, { status: 400 });
    const built = await buildOrderEmail(actor.companyId, parsed.data);
    if (built.error) return NextResponse.json({ error: built.error, code: built.error }, { status: STATUS[built.error] });

    const results = [];
    for (const to of built.to) {
      results.push(
        await sendMail({ to, ...built.email, fromEmail: built.from, senderName: built.companyName, replyTo: built.replyTo })
      );
    }
    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ sent, total: built.to.length }, { status: sent > 0 ? 200 : 502 });
  } catch (error) {
    return handleApiError('stock:orders:send', error, { fallbackMessage: 'Could not send.' });
  }
}

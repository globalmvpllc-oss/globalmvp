export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { buildOrderEmail, orderSchema } from '@/lib/stock/orders';

const STATUS = { VENDOR_NOT_FOUND: 404, NO_EMAIL: 400, NO_LINES: 400 } as const;

/** POST { vendorId, lines, note } — the exact email, shown before sending. Sends nothing. */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('order.email');
    if (error) return error;
    const parsed = orderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the quantities.', code: 'INVALID' }, { status: 400 });
    const built = await buildOrderEmail(actor.companyId, parsed.data, actor.name);
    if (built.error) return NextResponse.json({ error: built.error, code: built.error }, { status: STATUS[built.error] });
    return NextResponse.json({
      to: built.to,
      from: built.from,
      replyTo: built.replyTo,
      subject: built.email.subject,
      text: built.email.text,
      html: built.email.html,
    });
  } catch (error) {
    return handleApiError('stock:orders:preview', error, { fallbackMessage: 'Could not prepare the email.' });
  }
}

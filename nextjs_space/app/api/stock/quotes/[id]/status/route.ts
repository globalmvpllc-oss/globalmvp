export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { notifyLowStock } from '@/lib/stock/alerts';
import { QuoteStockConfirmationNeeded, setStockQuoteStatus } from '@/lib/stock/quotes';

const schema = z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), confirmed: z.boolean().optional() });

/**
 * POST { status: ACCEPTED | REJECTED, confirmed } — mark a quote. Accepting
 * takes its products out of stock once ("Satış (−)", note "Teklif TKL-…");
 * stock going below zero answers 409 CONFIRM with the products until confirmed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a status.', code: 'INVALID' }, { status: 400 });
    const result = await setStockQuoteStatus(actor, params.id, parsed.data.status, parsed.data.confirmed === true);
    for (const m of result.moved) if (m.alert) await notifyLowStock(actor.companyId, m.product);
    return NextResponse.json({ status: result.status, moved: result.moved.length });
  } catch (error) {
    if (error instanceof QuoteStockConfirmationNeeded) return NextResponse.json({ error: 'Please confirm.', code: 'CONFIRM', negative: error.negative }, { status: 409 });
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof Error && error.message === 'BAD_TRANSITION') return NextResponse.json({ error: 'That status change is not possible.', code: 'BAD_TRANSITION' }, { status: 409 });
    return handleApiError('stock:quotes:status', error, { fallbackMessage: 'Could not save.' });
  }
}

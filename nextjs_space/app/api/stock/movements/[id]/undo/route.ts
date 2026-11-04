export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { undoMovement } from '@/lib/stock/service';
import { notifyLowStock } from '@/lib/stock/alerts';

const STATUS: Record<string, number> = { NOT_FOUND: 404, TOO_LATE: 409, ALREADY_UNDONE: 409, NOT_YOURS: 403, NOT_UNDOABLE: 409 };

/** POST — "Geri al": reverses one movement, once, shortly after it was made. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('move');
    if (error) return error;
    const outcome = await undoMovement(actor, params.id);
    if (!outcome.ok) return NextResponse.json({ error: 'Cannot undo.', code: outcome.code }, { status: STATUS[outcome.code] ?? 409 });
    if (outcome.result.alert) await notifyLowStock(actor.companyId, outcome.result.product);
    return NextResponse.json({ ok: true, quantity: outcome.result.quantityAfter });
  } catch (error) {
    return handleApiError('stock:undo', error, { fallbackMessage: 'Could not undo.' });
  }
}

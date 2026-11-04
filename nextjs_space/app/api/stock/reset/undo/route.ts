export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { undoLastReset } from '@/lib/stock/data';

/** POST — "Son sıfırlamayı geri al", within 24 hours (manager with an account). */
export async function POST() {
  try {
    const { actor, error } = await requireStockActor('reset');
    if (error) return error;
    if (actor.kind !== 'user') return NextResponse.json({ error: 'Sign in with your account.', code: 'ACCOUNT_REQUIRED' }, { status: 403 });
    const outcome = await undoLastReset(actor);
    if (!outcome.ok) return NextResponse.json({ error: 'Nothing to undo.', code: outcome.code }, { status: 409 });
    return NextResponse.json({ ok: true, restored: outcome.restored });
  } catch (error) {
    return handleApiError('stock:reset:undo', error, { fallbackMessage: 'Could not undo the reset.' });
  }
}

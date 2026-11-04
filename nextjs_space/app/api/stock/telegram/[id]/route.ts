export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

/** DELETE — disconnect one Telegram chat from this company's alerts (manager). */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const result = await prisma.stockTelegramChat.deleteMany({ where: { id: params.id, companyId: actor.companyId } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:telegram:DELETE', error, { fallbackMessage: 'Could not disconnect.' });
  }
}

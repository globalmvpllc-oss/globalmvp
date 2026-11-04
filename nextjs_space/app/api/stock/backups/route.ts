export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

/** GET — the nightly Excel backups of the last 30 days (manager, accountant). */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('export');
    if (error) return error;
    const backups = await prisma.stockBackup.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, day: true },
      orderBy: { day: 'desc' },
      take: 31,
    });
    return NextResponse.json({ backups });
  } catch (error) {
    return handleApiError('stock:backups', error, { fallbackMessage: 'Could not load.' });
  }
}

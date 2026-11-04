export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { ensureStockSettings, newStaffCode } from '@/lib/stock/settings';

/**
 * POST — "Personel linkini yenile" (manager). The company gets a new staff
 * sign-in link; the old one stops working at once (it no longer matches any
 * company). People already signed in stay signed in; use "sign out" on a
 * person to end their sessions too.
 */
export async function POST() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    await ensureStockSettings(actor.companyId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const staffCode = newStaffCode();
      try {
        await prisma.stockSettings.update({ where: { companyId: actor.companyId }, data: { staffCode }, select: { id: true } });
        return NextResponse.json({ staffCode });
      } catch (e) {
        // Another company already has this code (practically never): try a new one.
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      }
    }
    return NextResponse.json({ error: 'Could not create a new link.', code: 'RETRY' }, { status: 500 });
  } catch (error) {
    return handleApiError('stock:staff:link', error, { fallbackMessage: 'Could not create a new link.' });
  }
}

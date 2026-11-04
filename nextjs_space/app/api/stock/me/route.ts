export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { can } from '@/lib/stock/rules';

/** GET /api/stock/me — who is signed in, their role, and what the screen may show. */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const company = await prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true, usageMode: true, defaultCurrency: true },
    });
    // Read only: the settings row (and the staff link) is created when the
    // first staff member is added, never by a GET.
    const settings = can(actor.role, 'settings')
      ? await prisma.stockSettings.findUnique({ where: { companyId: actor.companyId }, select: { staffCode: true } })
      : null;
    return NextResponse.json({
      name: actor.name,
      kind: actor.kind,
      role: actor.role,
      companyName: company?.name ?? '',
      usageMode: company?.usageMode ?? 'finance',
      currency: company?.defaultCurrency ?? 'TRY',
      staffCode: settings?.staffCode ?? null,
      permissions: {
        prices: can(actor.role, 'read.prices'),
        move: can(actor.role, 'move'),
        count: can(actor.role, 'count'),
        products: can(actor.role, 'products.write'),
        suppliers: can(actor.role, 'suppliers.write'),
        settings: can(actor.role, 'settings'),
        orderEmail: can(actor.role, 'order.email'),
        export: can(actor.role, 'export'),
        reset: can(actor.role, 'reset') && actor.kind === 'user',
      },
    });
  } catch (error) {
    return handleApiError('stock:me', error, { fallbackMessage: 'Could not load.' });
  }
}

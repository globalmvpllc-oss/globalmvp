export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { orderQuantity, searchTerms } from '@/lib/stock/rules';

/**
 * GET /api/stock/picker?q= — product search for the order email and the sales
 * quote: photo flag, name, size, stock, sale price, the supplier an order
 * would go to (the product's, else its category's) and the suggested order
 * quantity. Managers only (it carries prices); Turkish-insensitive.
 */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('order.email');
    if (error) return error;
    const terms = searchTerms(new URL(request.url).searchParams.get('q'));
    if (terms.length === 0) return NextResponse.json({ products: [] });
    const rows = await prisma.stockProduct.findMany({
      where: { companyId: actor.companyId, isActive: true, AND: terms.map((t) => ({ searchKey: { contains: t } })) },
      select: {
        id: true, code: true, name: true, size: true, unit: true, quantity: true, minStock: true, targetStock: true,
        salePrice: true, photoKey: true, vendorId: true, category: { select: { vendorId: true } },
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      take: 30,
    });
    return NextResponse.json({
      products: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        size: p.size ?? null,
        unit: p.unit,
        quantity: Number(p.quantity),
        hasPhoto: Boolean(p.photoKey),
        salePrice: p.salePrice === null ? null : Number(p.salePrice),
        vendorId: p.vendorId ?? p.category?.vendorId ?? null,
        suggested: Math.max(orderQuantity({ quantity: p.quantity.toString(), minStock: p.minStock.toString(), targetStock: p.targetStock?.toString() ?? null }).toNumber(), 1),
      })),
    });
  } catch (error) {
    return handleApiError('stock:picker', error, { fallbackMessage: 'Could not search.' });
  }
}

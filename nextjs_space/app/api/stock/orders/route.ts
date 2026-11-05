export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { groupOrderLines } from '@/lib/stock/rules';
import { vendorEmails } from '@/lib/stock/contacts';

/**
 * GET — the purchase-order draft: critical products (at or below the
 * minimum) grouped by supplier, with the suggested quantity
 * (target − current, or minimum × 2 − current). Manager only.
 */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('order.email');
    if (error) return error;
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "StockProduct" WHERE "companyId" = ${actor.companyId} AND "isActive" = true AND quantity <= "minStock"`;
    const products = await prisma.stockProduct.findMany({
      where: { companyId: actor.companyId, id: { in: ids.map((r) => r.id) } },
      select: {
        id: true, code: true, name: true, size: true, unit: true, quantity: true, minStock: true, targetStock: true, vendorId: true, photoKey: true,
        category: { select: { vendorId: true } },
      },
      orderBy: { name: 'asc' },
    });
    const groups = groupOrderLines(
      products.map((p) => ({ ...p, quantity: p.quantity.toString(), minStock: p.minStock.toString(), targetStock: p.targetStock?.toString() ?? null, categoryVendorId: p.category?.vendorId ?? null }))
    );
    const vendors = await prisma.vendor.findMany({
      where: { companyId: actor.companyId, id: { in: groups.map((g) => g.vendorId).filter((v): v is string => Boolean(v)) } },
      select: { id: true, name: true, email: true, orderEmails: true },
    });
    const vendorOf = new Map(vendors.map((v) => [v.id, v]));
    const productOf = new Map(products.map((p) => [p.id, p]));
    return NextResponse.json({
      groups: groups.map((g) => {
        const v = g.vendorId ? vendorOf.get(g.vendorId) : null;
        const emails = vendorEmails(v);
        // Photo flag and current stock for the screen; quantity stays the suggested order quantity.
        const lines = g.lines.map((l) => ({ ...l, hasPhoto: Boolean(productOf.get(l.productId)?.photoKey), stock: Number(productOf.get(l.productId)?.quantity ?? 0) }));
        return { vendorId: g.vendorId, vendorName: v?.name ?? null, emails, lines };
      }),
    });
  } catch (error) {
    return handleApiError('stock:orders:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

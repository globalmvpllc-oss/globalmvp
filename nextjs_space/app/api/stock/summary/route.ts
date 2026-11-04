export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { startOfStockDay } from '@/lib/stock/service';

/** GET /api/stock/summary — the three tiles: Kritik, Stok yok, Bugünkü hareketler. */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const companyId = actor.companyId;
    const [levels, today] = await Promise.all([
      prisma.$queryRaw<Array<{ low: bigint; out: bigint; total: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= "minStock") AS low,
          COUNT(*) FILTER (WHERE quantity <= 0) AS out,
          COUNT(*) AS total
        FROM "StockProduct" WHERE "companyId" = ${companyId} AND "isActive" = true`,
      prisma.stockMovement.count({ where: { companyId, createdAt: { gte: startOfStockDay() }, undoneAt: null, undoOfId: null } }),
    ]);
    const row = levels[0] ?? { low: 0n, out: 0n, total: 0n };
    return NextResponse.json({ low: Number(row.low), out: Number(row.out), total: Number(row.total), today });
  } catch (error) {
    return handleApiError('stock:summary', error, { fallbackMessage: 'Could not load.' });
  }
}

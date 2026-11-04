export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { countCorrections } from '@/lib/stock/rules';
import { moveStockTx, type MoveResult } from '@/lib/stock/service';
import { notifyLowStock } from '@/lib/stock/alerts';
import type { TxClient } from '@/lib/invoice-number';

/**
 * POST — finish a count. Every counted product that differs gets a
 * "Sayım düzeltmesi" movement (counted − current), all in one transaction,
 * and the count closes. The close is claimed with a conditional update, so
 * finishing twice applies once.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const outcome = await prisma.$transaction(
      async (tx: TxClient) => {
        const claimed = await tx.stockCount.updateMany({
          where: { id: params.id, companyId: actor.companyId, status: 'open' },
          data: { status: 'done', finishedAt: new Date() },
        });
        if (claimed.count !== 1) return null;
        const lines = await tx.stockCountLine.findMany({ where: { countId: params.id }, select: { productId: true, counted: true } });
        const products = await tx.stockProduct.findMany({
          where: { companyId: actor.companyId, isActive: true, id: { in: lines.map((l) => l.productId) } },
          select: { id: true, quantity: true },
        });
        const corrections = countCorrections(lines, new Map(products.map((p) => [p.id, p.quantity])));
        const results: MoveResult[] = [];
        for (const c of corrections) {
          results.push(
            await moveStockTx(tx, { companyId: actor.companyId, productId: c.productId, delta: c.delta, reason: 'count', actor, countId: params.id })
          );
        }
        return { counted: lines.length, changed: corrections.length, results };
      },
      { timeout: 60_000 }
    );
    if (!outcome) return NextResponse.json({ error: 'Not found', code: 'NOT_OPEN' }, { status: 404 });
    for (const r of outcome.results) if (r.alert) await notifyLowStock(actor.companyId, r.product);
    return NextResponse.json({ counted: outcome.counted, changed: outcome.changed });
  } catch (error) {
    return handleApiError('stock:count:finish', error, { fallbackMessage: 'Could not finish the count.' });
  }
}

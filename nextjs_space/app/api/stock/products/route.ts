export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { checkPlanLimit } from '@/lib/billing/limits';
import { requireStockActor } from '@/lib/stock/actor';
import { buildSearchKey, searchTerms } from '@/lib/stock/rules';
import { moveStockTx, serializeProduct } from '@/lib/stock/service';
import { productInputSchema } from '@/lib/stock/product-input';
import type { TxClient } from '@/lib/invoice-number';

const INCLUDE = { category: { select: { name: true } }, vendor: { select: { name: true } } } as const;

/**
 * GET /api/stock/products?q=&categoryId=&level=low|out&take=&skip=
 *
 * The main list. `q` matches name and code, Turkish-insensitive ("cember" →
 * "Çember", "pz1" → "PZ001"), each word must match. `level=low` is at or
 * below the minimum but above zero; `level=out` is zero or less. Staff get
 * the same list without prices.
 */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(Number(searchParams.get('take')) || 50, 1), 200);
    const skip = Math.max(Number(searchParams.get('skip')) || 0, 0);
    const categoryId = searchParams.get('categoryId') || undefined;
    const level = searchParams.get('level');
    const terms = searchTerms(searchParams.get('q'));

    const where: Record<string, unknown> = { companyId: actor.companyId, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (terms.length) where.AND = terms.map((t) => ({ searchKey: { contains: t } }));
    if (level === 'low' || level === 'out') {
      // Two columns compared, so the ids come from SQL; still company-scoped.
      const ids =
        level === 'low'
          ? await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "StockProduct" WHERE "companyId" = ${actor.companyId} AND "isActive" = true AND quantity > 0 AND quantity <= "minStock"`
          : await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "StockProduct" WHERE "companyId" = ${actor.companyId} AND "isActive" = true AND quantity <= 0`;
      where.id = { in: ids.map((r) => r.id) };
    }

    const [rows, total] = await Promise.all([
      prisma.stockProduct.findMany({ where, include: INCLUDE, orderBy: [{ name: 'asc' }, { code: 'asc' }], take, skip }),
      prisma.stockProduct.count({ where }),
    ]);
    return NextResponse.json({ products: rows.map((p) => serializeProduct(p, actor)), total, take, skip });
  } catch (error) {
    return handleApiError('stock:products:GET', error, { fallbackMessage: 'Could not load products.' });
  }
}

/** POST — add a product (manager). Counts against the plan's product limit. */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const parsed = productInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Check the form.', code: 'INVALID', details: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 400 });
    }
    const verdict = await checkPlanLimit(actor.companyId, 'stockProducts');
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: 'Your plan’s product limit is reached.', code: 'PLAN_LIMIT', limit: verdict.limit, plan: verdict.plan },
        { status: 402 }
      );
    }
    const d = parsed.data;
    const [category, vendor] = await Promise.all([
      d.categoryId ? prisma.stockCategory.findFirst({ where: { id: d.categoryId, companyId: actor.companyId }, select: { id: true } }) : null,
      d.vendorId ? prisma.vendor.findFirst({ where: { id: d.vendorId, companyId: actor.companyId }, select: { id: true } }) : null,
    ]);
    if ((d.categoryId && !category) || (d.vendorId && !vendor)) {
      return NextResponse.json({ error: 'Category or supplier not found.', code: 'INVALID' }, { status: 400 });
    }

    const product = await prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.stockProduct.create({
        data: {
          companyId: actor.companyId,
          code: d.code,
          name: d.name,
          searchKey: buildSearchKey({ code: d.code, name: d.name, size: d.size, material: d.material }),
          categoryId: category?.id ?? null,
          size: d.size ?? null,
          material: d.material ?? null,
          unit: d.unit ?? 'adet',
          purchasePrice: d.purchasePrice ?? null,
          salePrice: d.salePrice ?? null,
          minStock: d.minStock ?? 50,
          targetStock: d.targetStock ?? null,
          shelf: d.shelf ?? null,
          vendorId: vendor?.id ?? null,
          notes: d.notes ?? null,
        },
      });
      if (d.openingStock && d.openingStock > 0) {
        await moveStockTx(tx, { companyId: actor.companyId, productId: created.id, delta: d.openingStock, reason: 'opening', actor });
      }
      return tx.stockProduct.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE });
    });
    return NextResponse.json(serializeProduct(product, actor), { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'This code is already used.', code: 'DUPLICATE_CODE' }, { status: 409 });
    }
    return handleApiError('stock:products:POST', error, { fallbackMessage: 'Could not save the product.' });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

async function openCount(id: string, companyId: string) {
  return prisma.stockCount.findFirst({ where: { id, companyId, status: 'open' }, select: { id: true, categoryId: true, position: true } });
}

/**
 * GET — the count's products in order (name, code), what was counted so far
 * and where it was left. No prices and no expected number: people count
 * what they see.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const count = await openCount(params.id, actor.companyId);
    if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [products, lines] = await Promise.all([
      prisma.stockProduct.findMany({
        where: { companyId: actor.companyId, isActive: true, ...(count.categoryId ? { categoryId: count.categoryId } : {}) },
        select: { id: true, code: true, name: true, unit: true, photoKey: true, shelf: true },
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        take: 5000,
      }),
      prisma.stockCountLine.findMany({ where: { countId: count.id }, select: { productId: true, counted: true } }),
    ]);
    const counted = new Map(lines.map((l) => [l.productId, Number(l.counted)]));
    return NextResponse.json({
      id: count.id,
      position: count.position,
      products: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        shelf: p.shelf,
        hasPhoto: Boolean(p.photoKey),
        counted: counted.has(p.id) ? counted.get(p.id) : null,
      })),
    });
  } catch (error) {
    return handleApiError('stock:count:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const lineSchema = z.object({
  productId: z.string().min(1),
  counted: z.number().finite().min(0).max(1e9),
  position: z.number().int().min(0).max(100000),
});

/** PUT { productId, counted, position } — save one counted number and the place. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const parsed = lineSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a number.', code: 'INVALID' }, { status: 400 });
    const count = await openCount(params.id, actor.companyId);
    if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const product = await prisma.stockProduct.findFirst({
      where: { id: parsed.data.productId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.$transaction([
      prisma.stockCountLine.upsert({
        where: { countId_productId: { countId: count.id, productId: product.id } },
        create: { countId: count.id, productId: product.id, counted: parsed.data.counted },
        update: { counted: parsed.data.counted },
      }),
      prisma.stockCount.update({ where: { id: count.id }, data: { position: parsed.data.position } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:count:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

/** DELETE — abandon an open count; nothing is applied. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const result = await prisma.stockCount.updateMany({
      where: { id: params.id, companyId: actor.companyId, status: 'open' },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:count:DELETE', error, { fallbackMessage: 'Could not cancel.' });
  }
}

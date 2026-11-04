export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

/** GET — open counts, to resume one (staff and up). */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const counts = await prisma.stockCount.findMany({
      where: { companyId: actor.companyId, status: 'open' },
      select: { id: true, categoryId: true, startedBy: true, createdAt: true, _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const ids = counts.map((c) => c.categoryId).filter((v): v is string => Boolean(v));
    const categories = await prisma.stockCategory.findMany({ where: { companyId: actor.companyId, id: { in: ids } }, select: { id: true, name: true } });
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    return NextResponse.json({
      counts: counts.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        categoryName: c.categoryId ? nameOf.get(c.categoryId) ?? null : null,
        startedBy: c.startedBy,
        createdAt: c.createdAt,
        counted: c._count.lines,
      })),
    });
  } catch (error) {
    return handleApiError('stock:counts:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/** POST { categoryId? } — start a count for one category, or for everything. */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('count');
    if (error) return error;
    const body = await request.json().catch(() => ({}));
    const categoryId = typeof body?.categoryId === 'string' && body.categoryId ? body.categoryId : null;
    if (categoryId) {
      const ok = await prisma.stockCategory.findFirst({ where: { id: categoryId, companyId: actor.companyId }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Category not found', code: 'INVALID' }, { status: 400 });
    }
    const count = await prisma.stockCount.create({
      data: { companyId: actor.companyId, categoryId, startedBy: actor.name.slice(0, 120) },
      select: { id: true },
    });
    return NextResponse.json(count, { status: 201 });
  } catch (error) {
    return handleApiError('stock:counts:POST', error, { fallbackMessage: 'Could not start the count.' });
  }
}

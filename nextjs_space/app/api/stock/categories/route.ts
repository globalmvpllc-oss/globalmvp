export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

/** GET: categories with product counts (everyone). POST { name }: add (manager). */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const rows = await prisma.stockCategory.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, name: true, vendorId: true, _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      categories: rows.map((c) => ({ id: c.id, name: c.name, vendorId: c.vendorId, count: c._count.products })),
    });
  } catch (error) {
    return handleApiError('stock:categories:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const schema = z.object({ name: z.string().trim().min(1).max(120), vendorId: z.string().nullable().optional() });

export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a name.', code: 'INVALID' }, { status: 400 });
    if (parsed.data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: parsed.data.vendorId, companyId: actor.companyId }, select: { id: true } });
      if (!vendor) return NextResponse.json({ error: 'Supplier not found', code: 'INVALID' }, { status: 400 });
    }
    const category = await prisma.stockCategory.upsert({
      where: { companyId_name: { companyId: actor.companyId, name: parsed.data.name } },
      create: { companyId: actor.companyId, name: parsed.data.name, vendorId: parsed.data.vendorId ?? null },
      update: parsed.data.vendorId !== undefined ? { vendorId: parsed.data.vendorId } : {},
      select: { id: true, name: true, vendorId: true },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleApiError('stock:categories:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { buildSearchKey } from '@/lib/stock/rules';
import { serializeProduct } from '@/lib/stock/service';
import { productInputSchema } from '@/lib/stock/product-input';

const INCLUDE = { category: { select: { name: true } }, vendor: { select: { name: true } } } as const;

/** GET — one product (prices only for those who may see them). */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const product = await prisma.stockProduct.findFirst({ where: { id: params.id, companyId: actor.companyId, isActive: true }, include: INCLUDE });
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(serializeProduct(product, actor));
  } catch (error) {
    return handleApiError('stock:product:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/**
 * PUT — edit (manager). The stock quantity is not editable here: it changes
 * only through a movement, so every change has a who and a why.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const parsed = productInputSchema.omit({ openingStock: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the form.', code: 'INVALID' }, { status: 400 });
    const d = parsed.data;
    const existing = await prisma.stockProduct.findFirst({ where: { id: params.id, companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [category, vendor] = await Promise.all([
      d.categoryId ? prisma.stockCategory.findFirst({ where: { id: d.categoryId, companyId: actor.companyId }, select: { id: true } }) : null,
      d.vendorId ? prisma.vendor.findFirst({ where: { id: d.vendorId, companyId: actor.companyId }, select: { id: true } }) : null,
    ]);
    if ((d.categoryId && !category) || (d.vendorId && !vendor)) {
      return NextResponse.json({ error: 'Category or supplier not found.', code: 'INVALID' }, { status: 400 });
    }
    const product = await prisma.stockProduct.update({
      where: { id: existing.id },
      data: {
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
      include: INCLUDE,
    });
    return NextResponse.json(serializeProduct(product, actor));
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'This code is already used.', code: 'DUPLICATE_CODE' }, { status: 409 });
    }
    return handleApiError('stock:product:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

/** DELETE — remove from the lists (manager). History stays: the row is deactivated. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('products.write');
    if (error) return error;
    const result = await prisma.stockProduct.updateMany({
      where: { id: params.id, companyId: actor.companyId, isActive: true },
      data: { isActive: false },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:product:DELETE', error, { fallbackMessage: 'Could not delete.' });
  }
}

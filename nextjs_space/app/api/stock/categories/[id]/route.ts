export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

const schema = z.object({ name: z.string().trim().min(1).max(120).optional(), vendorId: z.string().nullable().optional() });

/** PUT { name?, vendorId? } — rename a category or set its supplier (manager). */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('suppliers.write');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the values.', code: 'INVALID' }, { status: 400 });
    if (parsed.data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: parsed.data.vendorId, companyId: actor.companyId }, select: { id: true } });
      if (!vendor) return NextResponse.json({ error: 'Supplier not found', code: 'INVALID' }, { status: 400 });
    }
    const result = await prisma.stockCategory.updateMany({
      where: { id: params.id, companyId: actor.companyId },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.vendorId !== undefined ? { vendorId: parsed.data.vendorId } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Name already used.', code: 'DUPLICATE' }, { status: 409 });
    return handleApiError('stock:category:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

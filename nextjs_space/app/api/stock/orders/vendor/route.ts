export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { vendorEmails } from '@/lib/stock/contacts';

const schema = z.object({ productId: z.string().min(1), vendorId: z.string().min(1) });

/**
 * POST { productId, vendorId } — give a product its supplier from the order
 * screen, without opening the Suppliers page. Only the supplier changes;
 * both must belong to this company. Managers only.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('order.email');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a supplier.', code: 'INVALID' }, { status: 400 });
    const vendor = await prisma.vendor.findFirst({ where: { id: parsed.data.vendorId, companyId: actor.companyId }, select: { id: true, name: true, email: true, orderEmails: true } });
    if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.stockProduct.updateMany({ where: { id: parsed.data.productId, companyId: actor.companyId, isActive: true }, data: { vendorId: vendor.id } });
    if (updated.count !== 1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ vendorId: vendor.id, vendorName: vendor.name, emails: vendorEmails(vendor) });
  } catch (error) {
    return handleApiError('stock:orders:vendor', error, { fallbackMessage: 'Could not save.' });
  }
}

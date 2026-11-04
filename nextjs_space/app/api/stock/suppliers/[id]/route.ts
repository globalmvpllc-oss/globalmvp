export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { supplierSchema } from '@/lib/stock/product-input';

/**
 * PUT — edit a supplier (manager). Suppliers are the company's CorpControl
 * vendors, so there is no delete here: a vendor may also carry expenses.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('suppliers.write');
    if (error) return error;
    const parsed = supplierSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the name and emails.', code: 'INVALID' }, { status: 400 });
    const d = parsed.data;
    const emails = [...new Set(d.emails)];
    const result = await prisma.vendor.updateMany({
      where: { id: params.id, companyId: actor.companyId },
      data: { name: d.name, email: emails[0] ?? null, orderEmails: emails, phone: d.phone ?? null, notes: d.notes ?? null },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:suppliers:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

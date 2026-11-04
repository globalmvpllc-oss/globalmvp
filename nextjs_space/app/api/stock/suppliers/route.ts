export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { supplierSchema } from '@/lib/stock/product-input';

/**
 * GET /api/stock/suppliers — the company's suppliers (CorpControl vendors),
 * for pickers and the suppliers screen. Contact details only for those who
 * may email suppliers (managers) or read prices (accountant).
 */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const full = actor.role !== 'staff';
    const rows = await prisma.vendor.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, name: true, email: true, orderEmails: true, phone: true, notes: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      suppliers: rows.map((v) =>
        full
          ? { id: v.id, name: v.name, emails: v.orderEmails.length ? v.orderEmails : v.email ? [v.email] : [], phone: v.phone, notes: v.notes }
          : { id: v.id, name: v.name }
      ),
    });
  } catch (error) {
    return handleApiError('stock:suppliers:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/** POST — add a supplier (manager): name, several emails, phone, note. */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('suppliers.write');
    if (error) return error;
    const parsed = supplierSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the name and emails.', code: 'INVALID' }, { status: 400 });
    const d = parsed.data;
    const emails = [...new Set(d.emails)];
    const vendor = await prisma.vendor.create({
      data: { companyId: actor.companyId, name: d.name, email: emails[0] ?? null, orderEmails: emails, phone: d.phone ?? null, notes: d.notes ?? null },
      select: { id: true, name: true },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    return handleApiError('stock:suppliers:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

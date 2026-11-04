export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';

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

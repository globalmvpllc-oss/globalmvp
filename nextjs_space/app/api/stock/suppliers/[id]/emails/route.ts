export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { splitEmails, vendorEmails } from '@/lib/stock/contacts';

/**
 * POST { emails: "a@x.com, b@y.com" } — save a supplier's order addresses from
 * the order screen, without leaving it. Addresses already saved are kept;
 * the new ones are added. Managers only.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('suppliers.write');
    if (error) return error;
    const body = await request.json().catch(() => null);
    const added = splitEmails(body?.emails);
    if (added.length === 0) return NextResponse.json({ error: 'Enter a valid email.', code: 'INVALID' }, { status: 400 });
    const vendor = await prisma.vendor.findFirst({ where: { id: params.id, companyId: actor.companyId }, select: { id: true, email: true, orderEmails: true } });
    if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const emails = splitEmails([...vendorEmails(vendor), ...added]);
    await prisma.vendor.updateMany({ where: { id: vendor.id, companyId: actor.companyId }, data: { orderEmails: emails, email: emails[0] ?? null } });
    return NextResponse.json({ emails });
  } catch (error) {
    return handleApiError('stock:suppliers:emails', error, { fallbackMessage: 'Could not save.' });
  }
}

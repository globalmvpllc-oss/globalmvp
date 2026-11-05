export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { isEmailAddress } from '@/lib/stock/contacts';

/** PATCH { email } — give a customer an email address from the quote screen. Managers only. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isEmailAddress(email)) return NextResponse.json({ error: 'Enter a valid email.', code: 'INVALID' }, { status: 400 });
    const result = await prisma.customer.updateMany({ where: { id: params.id, companyId: actor.companyId }, data: { email } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const customer = await prisma.customer.findFirst({ where: { id: params.id, companyId: actor.companyId }, select: { id: true, name: true, companyName: true, email: true, phone: true } });
    return NextResponse.json({ customer });
  } catch (error) {
    return handleApiError('stock:customers:PATCH', error, { fallbackMessage: 'Could not save.' });
  }
}

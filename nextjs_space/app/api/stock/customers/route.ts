export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { requireStockActor } from '@/lib/stock/actor';
import { normalizeSearch } from '@/lib/stock/rules';
import { customerInputSchema } from '@/lib/stock/quotes';

/** GET ?q= — this company's customers for a quote (name, company, email, phone). Managers only. */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const q = normalizeSearch(new URL(request.url).searchParams.get('q'));
    const rows = await prisma.customer.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, name: true, companyName: true, email: true, phone: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const list = q
      ? rows.filter((c) => normalizeSearch(`${c.name} ${c.companyName ?? ''} ${c.email ?? ''}`).includes(q))
      : rows;
    return NextResponse.json({ customers: list.slice(0, 50) });
  } catch (error) {
    return handleApiError('stock:customers:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/** POST { name, companyName, email, phone } — quick new customer (the CorpControl Customer table). */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const parsed = customerInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a name and a valid email.', code: 'INVALID' }, { status: 400 });
    const denied = await enforcePlanLimit(actor.companyId, 'customers');
    if (denied) return denied;
    const customer = await prisma.customer.create({
      data: {
        companyId: actor.companyId,
        name: parsed.data.name,
        companyName: parsed.data.companyName || null,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone || null,
      },
      select: { id: true, name: true, companyName: true, email: true, phone: true },
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return handleApiError('stock:customers:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

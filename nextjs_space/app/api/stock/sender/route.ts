export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { ensureStockSettings } from '@/lib/stock/settings';
import { DEFAULT_STOCK_SENDER } from '@/lib/stock/orders';

/**
 * The sender address for purchase-order emails (manager).
 *
 * The customer's own address on their domain (e.g. stok@karadagmetal.com)
 * is used only once Resend has verified that domain's DNS records; until
 * then orders go from stok@corpcontrol.net with replies to the owner.
 *
 * GET           → current address, status and the DNS records to add.
 * POST {email}  → registers the domain with Resend and returns the records.
 * PUT           → asks Resend to check the records now.
 * DELETE        → back to stok@corpcontrol.net.
 */
function resend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function status(domainId: string | null) {
  const client = resend();
  if (!client || !domainId) return null;
  const { data } = await client.domains.get(domainId);
  if (!data) return null;
  return { status: data.status, records: (data.records ?? []).map((r: any) => ({ type: r.type, name: r.name, value: r.value, status: r.status, priority: r.priority ?? null })) };
}

export async function GET() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const s = await prisma.stockSettings.findUnique({ where: { companyId: actor.companyId }, select: { senderEmail: true, senderDomainId: true, senderVerifiedAt: true } });
    const live = await status(s?.senderDomainId ?? null);
    return NextResponse.json({
      senderEmail: s?.senderEmail ?? null,
      verified: Boolean(s?.senderVerifiedAt),
      inUse: s?.senderEmail && s?.senderVerifiedAt ? s.senderEmail : DEFAULT_STOCK_SENDER,
      domainStatus: live?.status ?? null,
      records: live?.records ?? [],
    });
  } catch (error) {
    return handleApiError('stock:sender:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(255) });

export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter an email address.', code: 'INVALID' }, { status: 400 });
    const domain = parsed.data.email.split('@')[1];
    if (domain === 'corpcontrol.net') return NextResponse.json({ error: 'Use your own domain.', code: 'INVALID' }, { status: 400 });
    const client = resend();
    if (!client) return NextResponse.json({ error: 'Email is not configured.', code: 'NOT_CONFIGURED' }, { status: 503 });

    let domainId: string | null = null;
    const created = await client.domains.create({ name: domain });
    if (created.data?.id) domainId = created.data.id;
    else {
      // Already registered (by this or another company of the same owner): reuse it.
      const listed = await client.domains.list();
      domainId = (listed.data?.data ?? []).find((d: any) => d.name === domain)?.id ?? null;
    }
    if (!domainId) return NextResponse.json({ error: 'The domain could not be registered.', code: 'DOMAIN_FAILED' }, { status: 502 });

    await ensureStockSettings(actor.companyId);
    await prisma.stockSettings.update({
      where: { companyId: actor.companyId },
      data: { senderEmail: parsed.data.email, senderDomainId: domainId, senderVerifiedAt: null },
      select: { id: true },
    });
    const live = await status(domainId);
    return NextResponse.json({ senderEmail: parsed.data.email, verified: false, records: live?.records ?? [] });
  } catch (error) {
    return handleApiError('stock:sender:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

export async function PUT() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const s = await prisma.stockSettings.findUnique({ where: { companyId: actor.companyId }, select: { senderDomainId: true } });
    const client = resend();
    if (!client || !s?.senderDomainId) return NextResponse.json({ error: 'Nothing to check.', code: 'NONE' }, { status: 409 });
    await client.domains.verify(s.senderDomainId);
    const live = await status(s.senderDomainId);
    const verified = live?.status === 'verified';
    await prisma.stockSettings.update({
      where: { companyId: actor.companyId },
      data: { senderVerifiedAt: verified ? new Date() : null },
      select: { id: true },
    });
    return NextResponse.json({ verified, domainStatus: live?.status ?? null, records: live?.records ?? [] });
  } catch (error) {
    return handleApiError('stock:sender:PUT', error, { fallbackMessage: 'Could not check.' });
  }
}

export async function DELETE() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    await prisma.stockSettings.updateMany({
      where: { companyId: actor.companyId },
      data: { senderEmail: null, senderDomainId: null, senderVerifiedAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:sender:DELETE', error, { fallbackMessage: 'Could not save.' });
  }
}

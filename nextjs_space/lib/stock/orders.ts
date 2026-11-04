import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { stockOrderEmail } from '@/lib/email/templates';
import { stockLocale } from './alerts';

/**
 * Purchase-order emails. Never sent by the system on its own: the manager
 * opens the draft, adjusts quantities, sees the email, and presses send.
 */

export const DEFAULT_STOCK_SENDER = 'stok@corpcontrol.net';

export const orderSchema = z.object({
  vendorId: z.string().min(1),
  lines: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().finite().positive().max(1e9) }))
    .min(1)
    .max(500),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** Builds the exact email a supplier would receive (used for preview and send). */
export async function buildOrderEmail(companyId: string, input: z.infer<typeof orderSchema>) {
  const [company, vendor, products, settings, owner] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true, email: true } }),
    prisma.vendor.findFirst({ where: { id: input.vendorId, companyId }, select: { id: true, name: true, email: true, orderEmails: true } }),
    prisma.stockProduct.findMany({
      where: { companyId, isActive: true, id: { in: input.lines.map((l) => l.productId) } },
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.stockSettings.findUnique({ where: { companyId }, select: { senderEmail: true, senderVerifiedAt: true } }),
    prisma.companyMember.findFirst({
      where: { companyId, role: 'owner', user: { isActive: true } },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { email: true } } },
    }),
  ]);
  if (!vendor) return { error: 'VENDOR_NOT_FOUND' as const };
  const to = vendor.orderEmails.length ? vendor.orderEmails : vendor.email ? [vendor.email] : [];
  if (to.length === 0) return { error: 'NO_EMAIL' as const };
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = input.lines
    .filter((l) => byId.has(l.productId))
    .map((l) => ({ code: byId.get(l.productId)!.code, name: byId.get(l.productId)!.name, unit: byId.get(l.productId)!.unit, quantity: l.quantity }));
  if (lines.length === 0) return { error: 'NO_LINES' as const };

  const email = stockOrderEmail({
    locale: stockLocale(company?.country),
    companyName: company?.name ?? '',
    supplierName: vendor.name,
    lines,
    note: input.note ?? null,
  });
  const from = settings?.senderEmail && settings.senderVerifiedAt ? settings.senderEmail : DEFAULT_STOCK_SENDER;
  const replyTo = owner?.user.email ?? company?.email ?? null;
  return { error: null, to, from, replyTo, companyName: company?.name ?? '', vendorName: vendor.name, lines, email };
}

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { stockOrderEmail } from '@/lib/email/templates';
import { stockLocale } from './alerts';
import { vendorEmails } from './contacts';

/**
 * Purchase-order emails. Never sent by the system on its own: the manager
 * opens the draft, adjusts quantities, sees the email, and presses send.
 */

export const DEFAULT_STOCK_SENDER = 'stok@corpcontrol.net';

/** "4 Kasım 2026" in the company's own time zone (Turkey when unknown). */
export function orderDate(now: Date, locale: 'tr' | 'en', timeZone?: string | null): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(now);
  try {
    return format(timeZone || 'Europe/Istanbul');
  } catch {
    return format('Europe/Istanbul');
  }
}

export const orderSchema = z.object({
  vendorId: z.string().min(1),
  lines: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().finite().positive().max(1e9) }))
    .min(1)
    .max(500),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** Builds the exact email a supplier would receive (used for preview and send). */
/** senderName: the manager who prepares and sends the order (signed at the bottom). */
export async function buildOrderEmail(companyId: string, input: z.infer<typeof orderSchema>, senderName: string, now = new Date()) {
  const [company, vendor, products, settings, owner] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true, email: true, timezone: true } }),
    prisma.vendor.findFirst({ where: { id: input.vendorId, companyId }, select: { id: true, name: true, email: true, orderEmails: true } }),
    prisma.stockProduct.findMany({
      where: { companyId, isActive: true, id: { in: input.lines.map((l) => l.productId) } },
      select: { id: true, code: true, name: true, size: true, unit: true },
    }),
    prisma.stockSettings.findUnique({ where: { companyId }, select: { senderEmail: true, senderVerifiedAt: true } }),
    prisma.companyMember.findFirst({
      where: { companyId, role: 'owner', user: { isActive: true } },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { email: true } } },
    }),
  ]);
  if (!vendor) return { error: 'VENDOR_NOT_FOUND' as const };
  const to = vendorEmails(vendor);
  if (to.length === 0) return { error: 'NO_EMAIL' as const };
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = input.lines
    .filter((l) => byId.has(l.productId))
    .map((l) => {
      const p = byId.get(l.productId)!;
      return { code: p.code, name: p.name, size: p.size ?? null, unit: p.unit, quantity: l.quantity };
    });
  if (lines.length === 0) return { error: 'NO_LINES' as const };

  const locale = stockLocale(company?.country);
  const email = stockOrderEmail({
    locale,
    date: orderDate(now, locale, company?.timezone),
    senderName: senderName.trim(),
    companyName: company?.name ?? '',
    supplierName: vendor.name,
    lines,
    note: input.note ?? null,
  });
  const from = settings?.senderEmail && settings.senderVerifiedAt ? settings.senderEmail : DEFAULT_STOCK_SENDER;
  const replyTo = owner?.user.email ?? company?.email ?? null;
  return { error: null, to, from, replyTo, companyName: company?.name ?? '', vendorName: vendor.name, lines, email };
}

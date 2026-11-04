import 'server-only';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { stockLowAlertEmail } from '@/lib/email/templates';
import { getBaseUrl } from '@/lib/site';
import { translate, fillTranslation, type Locale } from '@/lib/i18n';
import { sendTelegram } from './telegram';
import { DAILY_ALERT_LIMIT, stockDayKey } from './rules';

/** KolayStok speaks Turkish to a Turkish company, English otherwise. */
export function stockLocale(country: unknown): Locale {
  return typeof country === 'string' && country.toUpperCase() === 'TR' ? 'tr' : 'en';
}

/** Where alerts go: the configured addresses, or the company's active owners. */
export async function alertRecipients(companyId: string): Promise<string[]> {
  const settings = await prisma.stockSettings.findUnique({ where: { companyId }, select: { alertEmails: true } });
  if (settings?.alertEmails?.length) return settings.alertEmails;
  const owners = await prisma.companyMember.findMany({
    where: { companyId, role: 'owner', user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  return owners.map((o) => o.user.email);
}

/**
 * Takes one of today's instant-alert slots for the company, in one atomic
 * SQL step (parallel movements cannot go past the limit). False when the
 * day's 20 are used: that product still appears in the 07:00 summary.
 * Until the StockAlertDay table exists (migration 20261109120000) the limit
 * is simply not applied.
 */
export async function claimAlertSlot(companyId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ sent: number }>>`
      INSERT INTO "StockAlertDay" ("companyId", "day", "sent") VALUES (${companyId}, ${stockDayKey(now)}::date, 1)
      ON CONFLICT ("companyId", "day") DO UPDATE SET "sent" = "StockAlertDay"."sent" + 1
      WHERE "StockAlertDay"."sent" < ${DAILY_ALERT_LIMIT}
      RETURNING "sent"`;
    return rows.length > 0;
  } catch (error) {
    console.error('[stock:alert] daily limit not checked', (error as { code?: string })?.code);
    return true;
  }
}

/**
 * The low-stock alert, once per dip (the caller only calls this when the
 * movement claimed the product's alert stamp), at most 20 a day per company
 * for mail and Telegram together. Mail and Telegram are best effort: a
 * failed send never undoes the stock change.
 */
export async function notifyLowStock(
  companyId: string,
  product: { code: string; name: string; unit: string; quantity: number; minStock: number }
): Promise<void> {
  try {
    if (!(await claimAlertSlot(companyId))) return;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true } });
    const locale = stockLocale(company?.country);
    const url = `${getBaseUrl().replace(/\/+$/, '')}/kolaystok/app?level=low`;
    const recipients = await alertRecipients(companyId);
    const email = stockLowAlertEmail({ locale, companyName: company?.name ?? '', product, url });
    for (const to of recipients) await sendMail({ to, ...email });
    const chats = await prisma.stockTelegramChat.findMany({ where: { companyId }, select: { chatId: true } });
    const text =
      fillTranslation(locale, 'ks.alert.telegram', {
        name: product.name,
        code: product.code,
        quantity: product.quantity,
        unit: product.unit,
        min: product.minStock,
      }) + `\n${url}`;
    for (const chat of chats) await sendTelegram(chat.chatId, `${translate(locale, 'ks.brand')}: ${text}`);
  } catch (error) {
    console.error('[stock:alert] could not send', (error as { code?: string })?.code);
  }
}

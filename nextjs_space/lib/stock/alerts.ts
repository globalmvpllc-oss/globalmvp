import 'server-only';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { stockLowAlertEmail } from '@/lib/email/templates';
import { getBaseUrl } from '@/lib/site';
import { translate, fillTranslation, type Locale } from '@/lib/i18n';
import { sendTelegram } from './telegram';

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
 * The low-stock alert, once per dip (the caller only calls this when the
 * movement claimed the product's alert stamp). Mail and Telegram are best
 * effort: a failed send never undoes the stock change.
 */
export async function notifyLowStock(
  companyId: string,
  product: { code: string; name: string; unit: string; quantity: number; minStock: number }
): Promise<void> {
  try {
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

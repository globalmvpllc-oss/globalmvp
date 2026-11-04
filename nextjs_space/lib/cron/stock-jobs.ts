import 'server-only';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { stockDailyEmail } from '@/lib/email/templates';
import { getBaseUrl } from '@/lib/site';
import { fillTranslation } from '@/lib/i18n';
import { alertRecipients, stockLocale } from '@/lib/stock/alerts';
import { sendTelegram } from '@/lib/stock/telegram';
import { backupCompanyStock } from '@/lib/stock/data';

/**
 * Avc KolayStok in the daily job (04:00 UTC = 07:00 Turkey):
 *   - an Excel backup of each company's stock, kept 30 days in S3;
 *   - the morning summary of critical and out-of-stock products, by mail and
 *     Telegram — only when there is something to report.
 * One company failing does not stop the others.
 */
export async function runStockNightly(now: Date): Promise<{ companies: number; backups: number; summaries: number; failed: number }> {
  const companies = await prisma.stockProduct.groupBy({ by: ['companyId'], where: { isActive: true } });
  let backups = 0;
  let summaries = 0;
  let failed = 0;
  const base = getBaseUrl().replace(/\/+$/, '');
  for (const { companyId } of companies) {
    try {
      await backupCompanyStock(companyId, now);
      backups += 1;

      const rows = await prisma.$queryRaw<Array<{ code: string; name: string; unit: string; quantity: string }>>`
        SELECT code, name, unit, quantity::text AS quantity FROM "StockProduct"
        WHERE "companyId" = ${companyId} AND "isActive" = true AND quantity <= "minStock"
        ORDER BY quantity ASC, name ASC LIMIT 500`;
      if (rows.length === 0) continue;
      const out = rows.filter((r) => Number(r.quantity) <= 0).map((r) => ({ code: r.code, name: r.name, unit: r.unit }));
      const low = rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ code: r.code, name: r.name, unit: r.unit, quantity: Number(r.quantity) }));
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true } });
      const locale = stockLocale(company?.country);
      const url = `${base}/kolaystok/app?level=low`;
      const email = stockDailyEmail({ locale, companyName: company?.name ?? '', low, out, url });
      const day = now.toISOString().slice(0, 10);
      for (const to of await alertRecipients(companyId)) {
        await sendMail({ to, ...email, idempotencyKey: `ks-daily-${companyId}-${day}-${to}` });
      }
      const chats = await prisma.stockTelegramChat.findMany({ where: { companyId }, select: { chatId: true } });
      const text = fillTranslation(locale, 'ks.tg.daily', { company: company?.name ?? '', low: low.length, out: out.length }) + `\n${url}`;
      for (const chat of chats) await sendTelegram(chat.chatId, text);
      summaries += 1;
    } catch (error) {
      failed += 1;
      console.error('[cron] stock step failed for a company', { code: (error as { code?: string })?.code });
    }
  }
  return { companies: companies.length, backups, summaries, failed };
}

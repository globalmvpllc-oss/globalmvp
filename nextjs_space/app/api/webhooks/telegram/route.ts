export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendTelegram } from '@/lib/stock/telegram';
import { hashTelegramCode, isTelegramSecretValid, parseTelegramCommand } from '@/lib/stock/telegram-rules';
import { stockLocale } from '@/lib/stock/alerts';
import { fillTranslation, translate } from '@/lib/i18n';

/**
 * The Avc KolayStok Telegram bot (one bot for every company).
 *
 * Authenticated by the secret token Telegram echoes back (set with
 * setWebhook); anything without it is refused. Handles two commands:
 *   /start <code> — connects this chat to the company behind the one-time
 *                   code (30 minutes, single use: claimed with a conditional
 *                   update, so a retried delivery cannot use it twice).
 *   /stop         — disconnects this chat from every company.
 * Always answers 200 to Telegram once authenticated, so it stops retrying.
 */
export async function POST(request: Request) {
  if (!isTelegramSecretValid(request.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const update = await request.json().catch(() => null);
    const message = update?.message;
    const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : null;
    const command = parseTelegramCommand(message?.text);
    if (!chatId || !command) return NextResponse.json({ ok: true });

    if (command.cmd === 'stop') {
      const removed = await prisma.stockTelegramChat.deleteMany({ where: { chatId } });
      await sendTelegram(chatId, removed.count > 0 ? translate('tr', 'ks.tg.stopped') : translate('tr', 'ks.tg.notConnected'));
      return NextResponse.json({ ok: true });
    }

    const now = new Date();
    const code = await prisma.stockTelegramCode.findUnique({
      where: { codeHash: hashTelegramCode(command.arg) },
      select: { id: true, companyId: true, label: true, expiresAt: true, usedAt: true, company: { select: { name: true, country: true } } },
    });
    const locale = stockLocale(code?.company.country);
    if (!code || code.expiresAt <= now) {
      await sendTelegram(chatId, translate(locale, 'ks.tg.badLink'));
      return NextResponse.json({ ok: true });
    }
    const claimed = await prisma.stockTelegramCode.updateMany({
      where: { id: code.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      const already = await prisma.stockTelegramChat.findUnique({ where: { companyId_chatId: { companyId: code.companyId, chatId } }, select: { id: true } });
      await sendTelegram(chatId, already ? fillTranslation(locale, 'ks.tg.connected', { company: code.company.name }) : translate(locale, 'ks.tg.badLink'));
      return NextResponse.json({ ok: true });
    }
    const who = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(' ').slice(0, 60);
    await prisma.stockTelegramChat.upsert({
      where: { companyId_chatId: { companyId: code.companyId, chatId } },
      create: { companyId: code.companyId, chatId, name: who || code.label },
      update: { name: who || code.label },
    });
    await sendTelegram(chatId, fillTranslation(locale, 'ks.tg.connected', { company: code.company.name }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[telegram:webhook] failed', (error as { code?: string })?.code);
    return NextResponse.json({ ok: true });
  }
}

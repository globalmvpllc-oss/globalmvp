export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { telegramBotUsername } from '@/lib/stock/telegram';
import { newTelegramCode, telegramLink, TELEGRAM_CODE_MINUTES } from '@/lib/stock/telegram-rules';

/**
 * POST { label } — a "Connect Telegram" link for one person (manager).
 * The link carries a one-time code that expires in 30 minutes; the bot
 * learns the company and the person's label from it. Only its hash is kept.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const bot = telegramBotUsername();
    if (!bot) return NextResponse.json({ error: 'Telegram is not set up yet.', code: 'NOT_CONFIGURED' }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : actor.name;
    const { code, codeHash } = newTelegramCode();
    const expiresAt = new Date(Date.now() + TELEGRAM_CODE_MINUTES * 60_000);
    await prisma.stockTelegramCode.create({ data: { companyId: actor.companyId, codeHash, label, expiresAt }, select: { id: true } });
    return NextResponse.json({ url: telegramLink(bot, code), expiresAt });
  } catch (error) {
    return handleApiError('stock:telegram:link', error, { fallbackMessage: 'Could not create the link.' });
  }
}

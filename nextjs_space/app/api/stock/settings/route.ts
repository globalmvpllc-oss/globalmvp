export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { isIncreaseReason, isDecreaseReason, USAGE_MODES } from '@/lib/stock/rules';
import { ensureStockSettings, getQuickReasons } from '@/lib/stock/settings';
import { telegramBotUsername, telegramConfigured } from '@/lib/stock/telegram';

/** GET — KolayStok settings for the manager. */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const [settings, company, quick, chats] = await Promise.all([
      prisma.stockSettings.findUnique({
        where: { companyId: actor.companyId },
        select: { staffCode: true, alertEmails: true, senderEmail: true, senderVerifiedAt: true },
      }),
      prisma.company.findUnique({ where: { id: actor.companyId }, select: { usageMode: true } }),
      getQuickReasons(actor.companyId),
      prisma.stockTelegramChat.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return NextResponse.json({
      staffCode: settings?.staffCode ?? null,
      alertEmails: settings?.alertEmails ?? [],
      senderEmail: settings?.senderEmail ?? null,
      senderVerified: Boolean(settings?.senderVerifiedAt),
      usageMode: company?.usageMode ?? 'finance',
      quickPlusReason: quick.plus,
      quickMinusReason: quick.minus,
      telegram: { configured: telegramConfigured(), bot: telegramBotUsername(), chats },
      canChangeMode: actor.kind === 'user',
      canManageStaff: actor.kind === 'user',
    });
  } catch (error) {
    return handleApiError('stock:settings:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const schema = z.object({
  alertEmails: z.array(z.string().trim().toLowerCase().email().max(255)).max(10).optional(),
  usageMode: z.enum(USAGE_MODES).optional(),
  // + must add (Mal kabul, İade); − must take away (Satış, Fire, Üretim).
  quickPlusReason: z.string().refine(isIncreaseReason).optional(),
  quickMinusReason: z.string().refine(isDecreaseReason).optional(),
});

/** PUT — alert recipients, usage mode (account managers only), one-tap reasons. */
export async function PUT(request: Request) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the values.', code: 'INVALID' }, { status: 400 });
    const d = parsed.data;
    // Refuse before writing anything, so a refused request changes nothing.
    // The company's mode belongs to the account owner, not to PIN staff.
    if (d.usageMode && actor.kind !== 'user') {
      return NextResponse.json({ error: 'Only the account owner can change this.', code: 'STOCK_FORBIDDEN' }, { status: 403 });
    }
    await ensureStockSettings(actor.companyId);

    if (d.alertEmails) {
      await prisma.stockSettings.update({
        where: { companyId: actor.companyId },
        data: { alertEmails: [...new Set(d.alertEmails)] },
        select: { id: true },
      });
    }
    if (d.usageMode) {
      await prisma.company.update({ where: { id: actor.companyId }, data: { usageMode: d.usageMode }, select: { id: true } });
    }
    if (d.quickPlusReason || d.quickMinusReason) {
      await prisma.stockSettings.update({
        where: { companyId: actor.companyId },
        data: {
          ...(d.quickPlusReason ? { quickPlusReason: d.quickPlusReason } : {}),
          ...(d.quickMinusReason ? { quickMinusReason: d.quickMinusReason } : {}),
        },
        select: { id: true },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:settings:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { putObject } from '@/lib/s3';
import { sendMail } from '@/lib/email/mailer';
import { stockResetEmail } from '@/lib/email/templates';
import { checkRateLimit, LOGIN_RULE } from '@/lib/rate-limit';
import { requireStockActor } from '@/lib/stock/actor';
import { isResetWord } from '@/lib/stock/rules';
import { companyStockWorkbook, resetAllStock, RESET_UNDO_HOURS, XLSX_TYPE } from '@/lib/stock/data';

/** GET — the last reset and until when it can be undone (manager). */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('reset');
    if (error) return error;
    const last = await prisma.stockReset.findFirst({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, undoneAt: true },
    });
    const undoUntil = last && !last.undoneAt ? new Date(last.createdAt.getTime() + RESET_UNDO_HOURS * 3_600_000) : null;
    return NextResponse.json({ last, undoUntil: undoUntil && undoUntil > new Date() ? undoUntil : null });
  } catch (error) {
    return handleApiError('stock:reset:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

/**
 * POST { password, confirm: "SIFIRLA" } — reset all stock to zero.
 *
 * Only a manager signed in with a CorpControl account (the password is that
 * account's). Before anything changes, an Excel backup of the stock goes to
 * S3 and to the manager by email; then every product gets a "Sıfırlama"
 * movement, undoable for 24 hours.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('reset');
    if (error) return error;
    if (actor.kind !== 'user' || !actor.userId) {
      return NextResponse.json({ error: 'Sign in with your account to reset.', code: 'ACCOUNT_REQUIRED' }, { status: 403 });
    }
    const limit = checkRateLimit(`ks-reset:${actor.userId}`, LOGIN_RULE);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts.', code: 'RATE_LIMITED' }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    if (!isResetWord(body?.confirm)) return NextResponse.json({ error: 'Type SIFIRLA to confirm.', code: 'CONFIRM_WORD' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { hashedPassword: true, email: true } });
    if (!user?.hashedPassword) return NextResponse.json({ error: 'This account has no password.', code: 'NO_PASSWORD' }, { status: 403 });
    const ok = typeof body?.password === 'string' && (await bcrypt.compare(body.password, user.hashedPassword));
    if (!ok) return NextResponse.json({ error: 'Wrong password.', code: 'WRONG_PASSWORD' }, { status: 401 });

    // Backup first. If the backup cannot be stored, nothing is reset.
    const { bytes, locale, companyName, rows } = await companyStockWorkbook(actor.companyId, 'all', true);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `kolaystok/${actor.companyId}/sifirlama-${stamp}.xlsx`;
    await putObject(backupKey, bytes, XLSX_TYPE);

    const result = await resetAllStock(actor, backupKey);

    await sendMail({
      to: user.email,
      ...stockResetEmail({ locale, companyName, products: rows.length, by: actor.name }),
      attachments: [{ filename: `stok-yedegi-${stamp.slice(0, 10)}.xlsx`, content: Buffer.from(bytes) }],
    });
    return NextResponse.json({ ok: true, changed: result.changed, undoHours: RESET_UNDO_HOURS });
  } catch (error) {
    return handleApiError('stock:reset', error, { fallbackMessage: 'Could not reset.' });
  }
}

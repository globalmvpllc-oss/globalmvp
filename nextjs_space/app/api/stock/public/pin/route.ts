export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { checkRateLimit, clientKey, LOGIN_RULE } from '@/lib/rate-limit';
import { isLocked, isValidPin, PIN_LOCK_MINUTES, PIN_MAX_FAILURES } from '@/lib/stock/rules';
import { encodeStaffToken, newStaffToken, STAFF_COOKIE, STAFF_SESSION_MAX_AGE } from '@/lib/stock/session';

/**
 * POST /api/stock/public/pin { code, staffId, pin } — a staff member signs in.
 *
 * Five wrong PINs in a row lock that person for 15 minutes (stored on the
 * staff row, so it holds across devices); the address is also rate limited.
 * Success sets a signed, httpOnly cookie kept for 30 days on that phone.
 */
export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(clientKey(request, 'ks-pin'), LOGIN_RULE);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please wait.', code: 'RATE_LIMITED' }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const code = typeof body?.code === 'string' ? body.code : '';
    const staffId = typeof body?.staffId === 'string' ? body.staffId : '';
    if (!isValidPin(body?.pin) || !code || !staffId) {
      return NextResponse.json({ error: 'Enter your 4-digit PIN.', code: 'INVALID' }, { status: 400 });
    }

    const settings = await prisma.stockSettings.findUnique({ where: { staffCode: code }, select: { companyId: true } });
    if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const staff = await prisma.stockStaff.findFirst({
      where: { id: staffId, companyId: settings.companyId, isActive: true },
    });
    if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const now = new Date();
    const locked = () =>
      prisma.stockStaff
        .findUnique({ where: { id: staff.id }, select: { lockedUntil: true } })
        .then((s) => NextResponse.json({ error: 'Locked. Try again later.', code: 'LOCKED', lockedUntil: s?.lockedUntil ?? null }, { status: 423 }));
    if (isLocked(staff, now)) return locked();

    // Reserve this attempt BEFORE checking the PIN, in one atomic step: of many
    // requests sent at once only five get through, so parallel guessing cannot
    // get around the five-tries lock.
    const reserved = await prisma.stockStaff.updateMany({
      where: { id: staff.id, failedPins: { lt: PIN_MAX_FAILURES }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { failedPins: { increment: 1 }, lockedUntil: null },
    });
    if (reserved.count === 0) return locked();

    const ok = await bcrypt.compare(body.pin, staff.pinHash);
    if (!ok) {
      // The fifth reserved failure locks the person for 15 minutes.
      const lockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000);
      const lock = await prisma.stockStaff.updateMany({
        where: { id: staff.id, failedPins: { gte: PIN_MAX_FAILURES } },
        data: { failedPins: 0, lockedUntil },
      });
      if (lock.count > 0) {
        return NextResponse.json({ error: 'Locked for 15 minutes.', code: 'LOCKED', lockedUntil }, { status: 423 });
      }
      const after = await prisma.stockStaff.findUnique({ where: { id: staff.id }, select: { failedPins: true } });
      return NextResponse.json(
        { error: 'Wrong PIN.', code: 'WRONG_PIN', attemptsLeft: Math.max(PIN_MAX_FAILURES - (after?.failedPins ?? 0), 0) },
        { status: 401 }
      );
    }

    await prisma.stockStaff.update({ where: { id: staff.id }, data: { failedPins: 0, lockedUntil: null }, select: { id: true } });
    const res = NextResponse.json({ ok: true, name: staff.name, role: staff.role });
    res.cookies.set(STAFF_COOKIE, encodeStaffToken(newStaffToken(staff)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STAFF_SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    return handleApiError('stock:pin', error, { fallbackMessage: 'Could not sign in.' });
  }
}

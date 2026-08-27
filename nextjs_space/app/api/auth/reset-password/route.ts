export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { checkRateLimit, clientKey, RESET_PASSWORD_RULE } from '@/lib/rate-limit';
import { hashResetToken, verifyResetToken, checkNewPassword } from '@/lib/auth/password-reset';

/**
 * Spends a reset link and sets a new password.
 *
 * Unknown, expired and already-used tokens all return the same message, so a
 * caller cannot probe which links exist. The spend is race-safe: the token is
 * claimed with updateMany({ where: { id, usedAt: null } }) inside the same
 * transaction that writes the password, so two requests racing the same link
 * cannot both succeed.
 */
const INVALID_LINK =
  'This reset link is invalid or has expired. Please request a new one.';

function passwordError(reason: 'too-short' | 'too-long' | 'mismatch'): string {
  if (reason === 'too-short') return 'Password must be at least 8 characters.';
  if (reason === 'too-long') return 'Password is too long.';
  return 'The passwords do not match.';
}

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, 'reset-password'), RESET_PASSWORD_RULE);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { token?: unknown; password?: unknown; confirmation?: unknown }
      | null;

    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token) return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

    const check = checkNewPassword(body?.password, body?.confirmation);
    if (!check.ok) {
      return NextResponse.json({ error: passwordError(check.reason) }, { status: 400 });
    }

    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });

    if (verifyResetToken(stored) !== 'valid') {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(body!.password as string, 12);

    const outcome = await prisma.$transaction(async (tx) => {
      // Claim the token: only the request that flips usedAt from null wins.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored!.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false as const };

      await tx.user.update({
        where: { id: stored!.userId },
        data: { hashedPassword },
      });

      // Revoke database sessions. NOTE: JWT sessions are stateless and cannot be
      // revoked here — they expire at SESSION_MAX_AGE. With the JWT strategy this
      // is defence in depth; the reset still stops any future login with the old
      // password.
      await tx.session.deleteMany({ where: { userId: stored!.userId } });

      return { ok: true as const };
    });

    if (!outcome.ok) return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

    return NextResponse.json({ message: 'Your password has been reset. You can sign in now.' });
  } catch (error) {
    return handleApiError('reset-password', error, {
      fallbackMessage: 'Could not reset your password. Please try again.',
    });
  }
}

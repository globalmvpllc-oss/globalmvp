export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkRateLimit, clientKey, FORGOT_PASSWORD_RULE } from '@/lib/rate-limit';
import {
  generateResetToken,
  hashResetToken,
  buildResetUrl,
  RESET_TOKEN_TTL_MS,
} from '@/lib/auth/password-reset';
import { sendPasswordResetEmail } from '@/lib/auth/reset-email';

/**
 * Requests a password reset link.
 *
 * The response is ALWAYS the same — whether the address is registered, has a
 * password (OAuth-only accounts have none), or the email actually went out, and
 * even if the server erred. A different answer for a known address would turn
 * this into an account-enumeration oracle.
 *
 * Rate limited so it cannot be used to spray reset emails at an address.
 */
const GENERIC = {
  message: 'If an account exists for that email, a reset link is on its way.',
};

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, 'forgot-password'), FORGOT_PASSWORD_RULE);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (email) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, hashedPassword: true },
      });

      // Skipped silently for an unknown address or an OAuth-only account (no
      // password to reset). The caller cannot tell either apart from success.
      if (user?.hashedPassword) {
        // Invalidate any outstanding links before issuing a new one, so an old
        // email can no longer be used once a fresh one is requested.
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });

        const token = generateResetToken();
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });

        const resetUrl = buildResetUrl(token, process.env.NEXTAUTH_URL);
        await sendPasswordResetEmail(user.email, resetUrl);
      }
    }

    return NextResponse.json(GENERIC);
  } catch (error) {
    // Same response even on a server error — and the address is never logged.
    console.error('[forgot-password] error', { name: (error as { name?: string })?.name });
    return NextResponse.json(GENERIC);
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-helpers';
import { checkRateLimit, clientKey, RESEND_VERIFICATION_RULE } from '@/lib/rate-limit';
import { generateResetToken, hashResetToken } from '@/lib/auth/password-reset';
import { VERIFY_TOKEN_TTL_MS, buildVerifyUrl } from '@/lib/auth/email-verification';
import { sendVerificationEmail } from '@/lib/auth/reset-email';

/**
 * Re-sends the current user's verification email.
 *
 * The signed-in user asks for their own link — verification is not required to
 * sign in, so an unverified user is here already. The response is generic and
 * the endpoint is rate limited so it cannot be used to spray mail.
 */
const GENERIC = { message: 'If your email needs verifying, a new link is on its way.' };

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, 'resend-verification'), RESEND_VERIFICATION_RULE);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const session = await getSessionUser();
    if (session?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, emailVerified: true },
      });
      if (user && !user.emailVerified && user.email) {
        await prisma.emailVerificationToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });
        const token = generateResetToken();
        await prisma.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
          },
        });
        await sendVerificationEmail(user.email, buildVerifyUrl(token, process.env.NEXTAUTH_URL));
      }
    }
    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error('[resend-verification] error', { name: (error as { name?: string })?.name });
    return NextResponse.json(GENERIC);
  }
}

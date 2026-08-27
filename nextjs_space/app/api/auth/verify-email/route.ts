export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { hashResetToken, verifyResetToken } from '@/lib/auth/password-reset';

/**
 * Spends an email-verification link.
 *
 * Single-use and race-safe by the same pattern as the password reset: the token
 * is claimed with updateMany({ where: { id, usedAt: null } }) inside the
 * transaction that sets User.emailVerified, so a link cannot be spent twice.
 *
 * GET is what the emailed link hits — it spends and redirects to the result
 * page. POST does the same for the page's own fetch. Verification is never
 * required to sign in, so a bad or stale token just reports "invalid".
 */
async function spend(token: string): Promise<'verified' | 'invalid'> {
  if (!token) return 'invalid';

  const stored = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (verifyResetToken(stored) !== 'valid') return 'invalid';

  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: stored!.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.user.update({
      where: { id: stored!.userId },
      data: { emailVerified: new Date() },
    });
    return true;
  });

  return outcome ? 'verified' : 'invalid';
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const status = await spend(token);
    const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
    return NextResponse.redirect(`${base}/auth/verify-email?status=${status}`);
  } catch (error) {
    return handleApiError('verify-email:GET', error, {
      fallbackMessage: 'Could not verify your email.',
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === 'string' ? body.token : '';
    const status = await spend(token);
    return NextResponse.json({ status }, { status: status === 'verified' ? 200 : 400 });
  } catch (error) {
    return handleApiError('verify-email:POST', error, {
      fallbackMessage: 'Could not verify your email.',
    });
  }
}

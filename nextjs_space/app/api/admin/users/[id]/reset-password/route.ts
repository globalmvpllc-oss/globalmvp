export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import {
  generateResetToken,
  hashResetToken,
  buildResetUrl,
  RESET_TOKEN_TTL_MS,
} from '@/lib/auth/password-reset';
import { sendPasswordResetEmail } from '@/lib/auth/reset-email';

/**
 * Admin-triggered password reset.
 *
 * Reuses the exact same token flow as the self-service endpoint — a hashed,
 * single-use, one-hour link emailed to the user — so an admin never sees or sets
 * the password. Server-authorised via requireAdmin and written to the audit
 * trail. Skipped for OAuth-only accounts, which have no password to reset.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, hashedPassword: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (!user.hashedPassword) {
      return NextResponse.json(
        { error: 'This account signs in another way and has no password to reset.' },
        { status: 400 }
      );
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await sendPasswordResetEmail(user.email, buildResetUrl(token, process.env.NEXTAUTH_URL));

    await recordAudit({
      admin: gate.admin,
      action: 'admin.user.password_reset_sent',
      entityType: 'user',
      entityId: user.id,
      request,
      metadata: { email: user.email },
    });

    return NextResponse.json({ message: 'A password reset link has been sent to the user.' });
  } catch (error) {
    return handleApiError('admin:users:reset-password', error, {
      fallbackMessage: 'Could not send a reset link.',
    });
  }
}

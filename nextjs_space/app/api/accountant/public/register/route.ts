export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { checkRateLimit, clientKey, SIGNUP_RULE } from '@/lib/rate-limit';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/validation';
import { getServerLocale } from '@/lib/i18n/server';
import { inviteState } from '@/lib/accountant/rules';
import { claimInvite, findInviteByToken } from '@/lib/accountant/invites';
import { recordAccountantEvent } from '@/lib/accountant/audit';
import type { TxClient } from '@/lib/invoice-number';

/**
 * POST /api/accountant/public/register { token, name, password }
 *
 * The simple sign-up for an invited accountant who has no account yet. The
 * email is the invited address — it is not taken from the request — and is
 * marked verified, because only someone who received the invitation email
 * holds the token. Creates the user and the accountant membership together.
 * The client then signs in with the same credentials.
 */
const schema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(255),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(clientKey(request, 'signup'), SIGNUP_RULE);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the form and try again.', code: 'INVALID' }, { status: 400 });

    const invite = await findInviteByToken(parsed.data.token);
    if (!invite) return NextResponse.json({ error: 'Invitation not found.', code: 'invalid' }, { status: 404 });
    const state = inviteState(invite);
    if (state !== 'usable') return NextResponse.json({ error: 'This invitation cannot be used.', code: state }, { status: 410 });

    const exists = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    if (exists) return NextResponse.json({ error: 'An account already exists. Please sign in.', code: 'ACCOUNT_EXISTS' }, { status: 409 });

    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.user.create({
        data: {
          email: invite.email,
          name: parsed.data.name,
          hashedPassword,
          emailVerified: new Date(),
          language: getServerLocale(),
        },
        select: { id: true, email: true },
      });
      const ok = await claimInvite(tx, invite.id, created.id);
      if (!ok) throw new Error('INVITE_CLAIM_FAILED');
      return created;
    });

    await recordAccountantEvent({ actor: user, action: 'accountant.joined', companyId: invite.companyId, request });
    return NextResponse.json({ ok: true, email: user.email, companyId: invite.companyId });
  } catch (error) {
    // Two submits (or a signup in another tab) can both pass the "exists" check;
    // the second insert then hits the unique email. Same answer as above.
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'An account already exists. Please sign in.', code: 'ACCOUNT_EXISTS' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'INVITE_CLAIM_FAILED') {
      return NextResponse.json({ error: 'This invitation cannot be used.', code: 'used' }, { status: 410 });
    }
    return handleApiError('accountant:register', error, { fallbackMessage: 'The account could not be created.' });
  }
}

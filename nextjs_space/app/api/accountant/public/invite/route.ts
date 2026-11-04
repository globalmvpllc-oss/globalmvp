export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { inviteState } from '@/lib/accountant/rules';
import { findInviteByToken } from '@/lib/accountant/invites';

/**
 * GET /api/accountant/public/invite?token=… — what the invitation page needs.
 *
 * Public (the invitee may not have an account yet). It answers only for a
 * valid token, and only with what the invitee already knows from the email:
 * the company name and the invited address, plus whether that address
 * already has an account and who is signed in now.
 */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const invite = await findInviteByToken(token);
    if (!invite) return NextResponse.json({ state: 'invalid' }, { status: 404 });

    const [account, session] = await Promise.all([
      prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } }),
      getSessionUser(),
    ]);
    return NextResponse.json({
      state: inviteState(invite),
      companyName: invite.company.name,
      email: invite.email,
      accountExists: Boolean(account),
      signedInEmail: session?.email ?? null,
    });
  } catch (error) {
    return handleApiError('accountant:invite:GET', error, { fallbackMessage: 'Could not load the invitation.' });
  }
}

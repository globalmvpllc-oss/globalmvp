export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { acceptRefusal } from '@/lib/accountant/rules';
import { claimInvite, findInviteByToken } from '@/lib/accountant/invites';
import { recordAccountantEvent } from '@/lib/accountant/audit';
import type { TxClient } from '@/lib/invoice-number';

/**
 * POST /api/accountant/accept { token } — a signed-in user accepts.
 *
 * The account's email (read from the database, not the session token) must be
 * the invited address. Not company-scoped, so it does not go through
 * requireUserCompany: the user may not belong to any company yet, or may be
 * an accountant elsewhere whose active company is read-only.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const invite = await findInviteByToken(body?.token);
    if (!invite) return NextResponse.json({ error: 'Invitation not found.', code: 'invalid' }, { status: 404 });

    const account = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, email: true, isActive: true } });
    if (!account?.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const refusal = acceptRefusal(invite, account.email);
    if (refusal) return NextResponse.json({ error: 'This invitation cannot be used with this account.', code: refusal }, { status: 409 });

    const ok = await prisma.$transaction((tx: TxClient) => claimInvite(tx, invite.id, account.id));
    if (!ok) return NextResponse.json({ error: 'This invitation cannot be used.', code: 'used' }, { status: 410 });

    await recordAccountantEvent({ actor: account, action: 'accountant.joined', companyId: invite.companyId, request });
    return NextResponse.json({ ok: true, companyId: invite.companyId });
  } catch (error) {
    return handleApiError('accountant:accept', error, { fallbackMessage: 'The invitation could not be accepted.' });
  }
}

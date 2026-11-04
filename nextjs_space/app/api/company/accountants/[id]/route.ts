export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { ACCOUNTANT_ROLE, canManageAccountants } from '@/lib/accountant/rules';
import { recordAccountantEvent } from '@/lib/accountant/audit';

/**
 * DELETE /api/company/accountants/{id}?kind=member|invite — one click.
 *
 * member: removes an accountant's access to the active company. Only a
 *   membership with role "accountant" can be removed here, so this can never
 *   remove an owner.
 * invite: cancels an open invitation.
 * Both are scoped to the session's company.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    if (!canManageAccountants(auth.role)) {
      return NextResponse.json({ error: 'Only the company owner can manage accountant access.', code: 'NOT_OWNER' }, { status: 403 });
    }
    const { companyId, user } = auth;
    const kind = new URL(request.url).searchParams.get('kind') === 'invite' ? 'invite' : 'member';

    if (kind === 'invite') {
      const result = await prisma.accountantInvite.updateMany({
        where: { id: params.id, companyId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await recordAccountantEvent({ actor: user, action: 'accountant.invite_revoked', companyId, request, metadata: { inviteId: params.id } });
      return NextResponse.json({ ok: true });
    }

    const member = await prisma.companyMember.findFirst({
      where: { id: params.id, companyId, role: ACCOUNTANT_ROLE },
      select: { id: true, user: { select: { email: true } } },
    });
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.companyMember.deleteMany({ where: { id: member.id, companyId, role: ACCOUNTANT_ROLE } });
    await recordAccountantEvent({ actor: user, action: 'accountant.removed', companyId, request, metadata: { email: member.user.email } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('accountants:DELETE', error, { fallbackMessage: 'Could not remove access.' });
  }
}

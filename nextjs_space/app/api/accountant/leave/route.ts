export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { ACCOUNTANT_ROLE } from '@/lib/accountant/rules';
import { recordAccountantEvent } from '@/lib/accountant/audit';

/**
 * POST /api/accountant/leave { companyId } — an accountant leaves a company.
 *
 * Deletes only the caller's own membership, and only if it is an accountant
 * membership: an owner cannot remove themselves this way. Not routed through
 * requireUserCompany because that refuses every POST from an accountant.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const companyId = typeof body?.companyId === 'string' ? body.companyId : '';
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const deleted = await prisma.companyMember.deleteMany({
      where: { userId: session.id, companyId, role: ACCOUNTANT_ROLE },
    });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAccountantEvent({ actor: session, action: 'accountant.left', companyId, request });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('accountant:leave', error, { fallbackMessage: 'Could not leave the company.' });
  }
}

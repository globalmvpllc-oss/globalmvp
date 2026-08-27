export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { blockActiveChange } from '@/lib/admin/member-rules';

/**
 * Activate or deactivate a user account.
 *
 * The one write this exposes is the isActive flag. Authorisation is resolved on
 * the server via requireAdmin — no header or body field reaches that decision —
 * and the change is recorded in the audit trail. A deactivated account is
 * refused at login and loses API access; its rows are kept.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
    if (typeof body?.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be true or false.' }, { status: 400 });
    }
    const isActive = body.isActive;

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, isActive: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const blocked = blockActiveChange({
      targetUserId: user.id,
      adminUserId: gate.admin.id,
      isActive,
    });
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive },
      select: { id: true, isActive: true },
    });

    await recordAudit({
      admin: gate.admin,
      action: isActive ? 'admin.user.activated' : 'admin.user.deactivated',
      entityType: 'user',
      entityId: user.id,
      request,
      metadata: { email: user.email },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError('admin:users:patch', error, {
      fallbackMessage: 'Could not update the user.',
    });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { isMemberRole, blockRoleChange, blockRemoval } from '@/lib/admin/member-rules';

/**
 * Managing one company membership: change its role, or remove it.
 *
 * The membership id is globally unique, so no company id needs to travel in the
 * path — the row itself carries the companyId used for the guards and the audit
 * entry. Authorisation is server-side via requireAdmin; every change is audited.
 * Both guards defend one invariant: a company is never left without an owner or
 * emptied of members.
 */

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
    const role = body?.role;
    if (!isMemberRole(role)) {
      return NextResponse.json({ error: 'Choose a valid role.' }, { status: 400 });
    }

    const member = await prisma.companyMember.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, companyId: true, userId: true },
    });
    if (!member) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    const ownerCount = await prisma.companyMember.count({
      where: { companyId: member.companyId, role: 'owner' },
    });
    const blocked = blockRoleChange({ currentRole: member.role, newRole: role, ownerCount });
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

    const updated = await prisma.companyMember.update({
      where: { id: member.id },
      data: { role },
      select: { id: true, role: true },
    });

    await recordAudit({
      admin: gate.admin,
      action: 'admin.member.role_changed',
      entityType: 'member',
      entityId: member.id,
      companyId: member.companyId,
      request,
      metadata: { userId: member.userId, from: member.role, to: role },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError('admin:members:patch', error, {
      fallbackMessage: 'Could not update the membership.',
    });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const member = await prisma.companyMember.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, companyId: true, userId: true },
    });
    if (!member) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });

    const [memberCount, ownerCount] = await Promise.all([
      prisma.companyMember.count({ where: { companyId: member.companyId } }),
      prisma.companyMember.count({ where: { companyId: member.companyId, role: 'owner' } }),
    ]);
    const blocked = blockRemoval({ role: member.role, memberCount, ownerCount });
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

    await prisma.companyMember.delete({ where: { id: member.id } });

    await recordAudit({
      admin: gate.admin,
      action: 'admin.member.removed',
      entityType: 'member',
      entityId: member.id,
      companyId: member.companyId,
      request,
      metadata: { userId: member.userId, role: member.role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('admin:members:delete', error, {
      fallbackMessage: 'Could not remove the membership.',
    });
  }
}

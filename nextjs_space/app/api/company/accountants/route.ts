export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getBaseUrl } from '@/lib/site';
import { getServerLocale } from '@/lib/i18n/server';
import { sendMail } from '@/lib/email/mailer';
import { accountantInviteEmail } from '@/lib/email/templates';
import {
  ACCOUNTANT_ROLE,
  canManageAccountants,
  inviteExpiry,
  inviteState,
  newInviteToken,
  normalizeEmail,
} from '@/lib/accountant/rules';
import { recordAccountantEvent } from '@/lib/accountant/audit';

/**
 * Accountant access for the active company — owner/admin only.
 *
 * GET  → who has access, open invitations, and the accountants' recent activity.
 * POST → invite { email }: a 7-day link by email (Resend).
 *
 * Accountants never reach this: requireUserCompany refuses /api/company/accountants
 * for them, and the role check below refuses anyone else who is not a manager.
 * Inviting is free on every plan; an accountant is not a team seat.
 */

function forbidden() {
  return NextResponse.json({ error: 'Only the company owner can manage accountant access.', code: 'NOT_OWNER' }, { status: 403 });
}

export async function GET() {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    if (!canManageAccountants(auth.role)) return forbidden();
    const { companyId } = auth;

    const [members, invites, activity] = await Promise.all([
      prisma.companyMember.findMany({
        where: { companyId, role: ACCOUNTANT_ROLE },
        select: { id: true, createdAt: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.accountantInvite.findMany({
        where: { companyId, acceptedAt: null, revokedAt: null },
        select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.auditLog.findMany({
        where: { companyId, action: { startsWith: 'accountant.' } },
        select: { id: true, createdAt: true, actorEmail: true, action: true, metadata: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      members: members.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, since: m.createdAt })),
      invites: invites
        .filter((i) => inviteState(i) === 'usable')
        .map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })),
      activity,
    });
  } catch (error) {
    return handleApiError('accountants:GET', error, { fallbackMessage: 'Could not load accountant access.' });
  }
}

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(255) });

export async function POST(request: Request) {
  try {
    const auth = await requireUserCompany();
    if (auth.error) return auth.error;
    if (!canManageAccountants(auth.role)) return forbidden();
    const { companyId, user } = auth;

    const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.', code: 'INVALID_EMAIL' }, { status: 400 });
    const email = normalizeEmail(parsed.data.email);

    if (email === normalizeEmail(user.email)) {
      return NextResponse.json({ error: 'You cannot invite your own address.', code: 'OWN_EMAIL' }, { status: 400 });
    }
    const existing = await prisma.companyMember.findFirst({
      where: { companyId, user: { email } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'This person already has access.', code: 'ALREADY_MEMBER' }, { status: 409 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const { token, tokenHash } = newInviteToken();
    const now = new Date();

    // One open invitation per address: a new one replaces the old link.
    await prisma.$transaction([
      prisma.accountantInvite.updateMany({
        where: { companyId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.accountantInvite.create({
        data: { companyId, email, tokenHash, invitedById: user.id, expiresAt: inviteExpiry(now) },
      }),
    ]);

    const url = `${getBaseUrl().replace(/\/+$/, '')}/invite/${token}`;
    const mail = await sendMail({
      to: email,
      ...accountantInviteEmail({
        locale: getServerLocale(),
        companyName: company?.name ?? '',
        inviterName: user.name || user.email || '',
        url,
      }),
      idempotencyKey: `accountant-invite-${tokenHash.slice(0, 32)}`,
    });

    await recordAccountantEvent({ actor: user, action: 'accountant.invited', companyId, request, metadata: { email } });
    return NextResponse.json({ ok: true, emailSent: mail.ok });
  } catch (error) {
    return handleApiError('accountants:POST', error, { fallbackMessage: 'The invitation could not be sent.' });
  }
}

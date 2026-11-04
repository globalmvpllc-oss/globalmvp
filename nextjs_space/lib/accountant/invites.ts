import 'server-only';
import { prisma } from '@/lib/db';
import { ACCOUNTANT_ROLE, hashInviteToken } from './rules';
import type { TxClient } from '@/lib/invoice-number';

/** The invitation a raw token names, with its company's name, or null. */
export async function findInviteByToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return prisma.accountantInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { company: { select: { id: true, name: true } } },
  });
}

/**
 * Turns an invitation into an accountant membership, inside a transaction.
 *
 * The invitation is claimed with a conditional update (still open, not
 * expired), so two clicks cannot both use it. An existing membership in the
 * company is left as it is: an owner who is invited does not become read-only.
 * Returns false when the invitation could not be claimed.
 */
export async function claimInvite(tx: TxClient, inviteId: string, userId: string, now: Date = new Date()): Promise<boolean> {
  const claimed = await tx.accountantInvite.updateMany({
    where: { id: inviteId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { acceptedAt: now, acceptedUserId: userId },
  });
  if (claimed.count !== 1) return false;
  const invite = await tx.accountantInvite.findUnique({ where: { id: inviteId }, select: { companyId: true } });
  if (!invite) return false;
  const existing = await tx.companyMember.findUnique({
    where: { userId_companyId: { userId, companyId: invite.companyId } },
    select: { id: true },
  });
  if (!existing) {
    await tx.companyMember.create({ data: { userId, companyId: invite.companyId, role: ACCOUNTANT_ROLE } });
  }
  return true;
}

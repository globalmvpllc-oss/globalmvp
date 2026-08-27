/**
 * Rules for the admin-side membership and account mutations.
 *
 * Pure and free of Prisma so each guard can be tested directly. The routes fetch
 * the counts and pass them in; the decision itself lives here, where a change to
 * "a company must always keep an owner" lands once and is covered by a test.
 */

/** The membership roles an admin may assign. */
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}

/**
 * Whether a role change must be refused, and why.
 *
 * The one invariant defended here: a company must never be left without an
 * owner. Demoting its only owner is refused so administration of that company
 * cannot be stranded.
 */
export function blockRoleChange(input: {
  currentRole: string;
  newRole: string;
  ownerCount: number;
}): string | null {
  if (!isMemberRole(input.newRole)) return 'Unknown role.';
  if (input.currentRole === input.newRole) return null;
  if (input.currentRole === 'owner' && input.newRole !== 'owner' && input.ownerCount <= 1) {
    return 'Cannot demote the only owner. Promote another member to owner first.';
  }
  return null;
}

/**
 * Whether removing a member must be refused, and why.
 *
 * A company is never emptied of members from here, and its last owner is never
 * removed — either would strand the company.
 */
export function blockRemoval(input: {
  role: string;
  memberCount: number;
  ownerCount: number;
}): string | null {
  if (input.memberCount <= 1) return 'Cannot remove the only member of a company.';
  if (input.role === 'owner' && input.ownerCount <= 1) {
    return 'Cannot remove the only owner. Assign another owner first.';
  }
  return null;
}

/**
 * Whether an active-status change must be refused, and why.
 *
 * An administrator cannot deactivate their own account — that is the one change
 * that could lock the panel's operator out of the panel.
 */
export function blockActiveChange(input: {
  targetUserId: string;
  adminUserId: string;
  isActive: boolean;
}): string | null {
  if (input.targetUserId === input.adminUserId && input.isActive === false) {
    return 'You cannot deactivate your own account.';
  }
  return null;
}

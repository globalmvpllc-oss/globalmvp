import { createHash, randomBytes } from 'crypto';

/**
 * Accountant (mali müşavir) access — the rules, kept pure so each is tested.
 *
 * An accountant is a CompanyMember with role "accountant". One account can
 * hold that role in many companies and switches between them with the usual
 * company switcher. The role reads everything a company has (lists, details,
 * reports, PDFs, exports) and changes nothing.
 *
 * The rule is enforced in `requireUserCompany`, which every company-scoped
 * API route goes through: for an accountant only GET/HEAD pass, and nothing
 * under /api/billing passes at all. Hiding buttons in the UI is a courtesy on
 * top of that, never the guarantee.
 */

export const ACCOUNTANT_ROLE = 'accountant';

/** Roles that may invite and remove accountants. */
export const ACCOUNTANT_MANAGER_ROLES = ['owner', 'admin'] as const;

/** An invitation can be accepted for this long. */
export const INVITE_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isAccountant(role: unknown): boolean {
  return role === ACCOUNTANT_ROLE;
}

export function canManageAccountants(role: unknown): boolean {
  return typeof role === 'string' && (ACCOUNTANT_MANAGER_ROLES as readonly string[]).includes(role);
}

/** API paths an accountant may not even read: plans, payments, subscription. */
const ACCOUNTANT_BLOCKED_PREFIXES = ['/api/billing', '/api/company/accountants'];

const READ_METHODS = new Set(['GET', 'HEAD']);

export interface AccessRefusal {
  status: 403;
  code: 'READ_ONLY' | 'NOT_FOR_ACCOUNTANT';
  error: string;
}

/**
 * Whether a company-scoped request must be refused for this member.
 *
 * `method` and `pathname` come from the headers the middleware stamps. If
 * either is missing for an accountant the request is refused: the rule fails
 * closed rather than open.
 */
export function accountantRefusal(input: {
  role: unknown;
  method: string | null | undefined;
  pathname: string | null | undefined;
}): AccessRefusal | null {
  if (!isAccountant(input.role)) return null;
  const method = (input.method ?? '').toUpperCase();
  const pathname = input.pathname ?? '';
  if (!pathname || ACCOUNTANT_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { status: 403, code: 'NOT_FOR_ACCOUNTANT', error: 'This area is not available to accountants.' };
  }
  if (!READ_METHODS.has(method)) {
    return { status: 403, code: 'READ_ONLY', error: 'Read-only access: accountants cannot make changes.' };
  }
  return null;
}

// --- Invitations ---------------------------------------------------------

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** A fresh invitation token (URL-safe) and the hash that is stored. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
}

export type InviteState = 'usable' | 'expired' | 'used' | 'revoked';

export function inviteState(
  invite: { expiresAt: Date | string; acceptedAt?: Date | string | null; revokedAt?: Date | string | null },
  now: Date = new Date()
): InviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.acceptedAt) return 'used';
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'usable';
}

/**
 * Why a signed-in user may not accept this invitation, or null when they may.
 * The account's email must be the invited address: the link alone is not
 * enough, so a forwarded email does not hand the books to someone else.
 */
export function acceptRefusal(
  invite: { email: string; expiresAt: Date | string; acceptedAt?: Date | string | null; revokedAt?: Date | string | null },
  accountEmail: unknown,
  now: Date = new Date()
): 'expired' | 'used' | 'revoked' | 'wrong-account' | null {
  const state = inviteState(invite, now);
  if (state !== 'usable') return state;
  if (normalizeEmail(accountEmail) !== normalizeEmail(invite.email)) return 'wrong-account';
  return null;
}

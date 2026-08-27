import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-helpers';
import { getAdminEmail, isAdminEmail } from './access';

/**
 * Resolving a request to an administrator.
 *
 * The address is read from the database row rather than the session: a JWT
 * carries whatever was true when it was minted, so a stale or forged claim must
 * not grant anything. Nothing the client sends participates in this decision.
 */

export { getAdminEmail, isAdminEmail, parsePagination, parseSearch, ADMIN_PAGE_SIZE, ADMIN_MAX_PAGE_SIZE } from './access';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
}

export type AdminCheck =
  | { ok: true; admin: AdminUser }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'not-configured' };

/**
 * Resolves the current request to an administrator, or explains why not.
 *
 * Separated from the responses below so both the API routes and the server
 * components can use the same decision without one of them re-implementing it.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  if (!getAdminEmail()) return { ok: false, reason: 'not-configured' };

  const session = await getSessionUser();
  if (!session?.id) return { ok: false, reason: 'unauthenticated' };

  // The address comes from the row, never from the session claim.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { ok: false, reason: 'unauthenticated' };
  if (!isAdminEmail(user.email)) return { ok: false, reason: 'forbidden' };

  return { ok: true, admin: user };
}

/**
 * Guard for an admin API route: returns a response to send, or the admin.
 *
 *   const gate = await requireAdmin();
 *   if ('response' in gate) return gate.response;
 */
export async function requireAdmin(): Promise<
  { response: NextResponse } | { admin: AdminUser }
> {
  const check = await checkAdmin();
  if (check.ok) return { admin: check.admin };

  if (check.reason === 'unauthenticated') {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  // 'not-configured' answers 403 as well: saying "no administrator is
  // configured" would tell an anonymous caller something about the deployment.
  return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

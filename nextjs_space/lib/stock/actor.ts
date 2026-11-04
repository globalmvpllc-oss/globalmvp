import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { can, stockRoleForMember, type StockPermission, type StockRole } from './rules';
import { decodeStaffToken, STAFF_COOKIE } from './session';

/**
 * Who is acting on KolayStok, and may they do this?
 *
 * Every /api/stock route calls `requireStockActor(permission)` first. It
 * accepts either
 *   - a CorpControl account (NextAuth session), resolved through
 *     requireUserCompany — so the accountant read-only rule still applies —
 *     and mapped: owner/admin → manager, accountant → viewer; or
 *   - a warehouse staff PIN session (signed cookie), re-checked against the
 *     staff row on every request (active, same company, PIN unchanged).
 * The company always comes from the session, never from the request.
 */
export interface StockActor {
  kind: 'user' | 'staff';
  role: StockRole;
  companyId: string;
  name: string;
  userId: string | null;
  staffId: string | null;
  email: string | null;
}

function refuse(status: number, code: string, error: string) {
  return { error: NextResponse.json({ error, code }, { status }), actor: null } as const;
}

export async function getStockActor(): Promise<
  { actor: StockActor; error: null } | { actor: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const auth = await requireUserCompany();
    if (auth.error) return { actor: null, error: auth.error };
    return {
      error: null,
      actor: {
        kind: 'user',
        role: stockRoleForMember(auth.role),
        companyId: auth.companyId,
        name: auth.user.name || auth.user.email || '',
        userId: auth.user.id,
        staffId: null,
        email: auth.user.email ?? null,
      },
    };
  }

  const token = decodeStaffToken(cookies().get(STAFF_COOKIE)?.value);
  if (!token) return refuse(401, 'NOT_SIGNED_IN', 'Please sign in.');
  const staff = await prisma.stockStaff.findFirst({
    where: { id: token.sid, companyId: token.cid, isActive: true },
    select: { id: true, companyId: true, name: true, role: true, sessionVersion: true },
  });
  // A PIN, role or active change bumps sessionVersion and ends earlier sessions.
  if (!staff || staff.sessionVersion !== token.v) return refuse(401, 'NOT_SIGNED_IN', 'Please sign in.');
  return {
    error: null,
    actor: {
      kind: 'staff',
      role: staff.role === 'manager' ? 'manager' : 'staff',
      companyId: staff.companyId,
      name: staff.name,
      userId: null,
      staffId: staff.id,
      email: null,
    },
  };
}

export async function requireStockActor(permission: StockPermission) {
  const result = await getStockActor();
  if (result.error) return result;
  if (!can(result.actor.role, permission)) {
    return refuse(403, 'STOCK_FORBIDDEN', 'You do not have permission for this.');
  }
  return result;
}

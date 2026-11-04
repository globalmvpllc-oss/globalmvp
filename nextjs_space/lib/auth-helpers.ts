import { getServerSession } from 'next-auth';
import { cookies, headers } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { ACTIVE_COMPANY_COOKIE, resolveActiveCompanyId } from '@/lib/active-company';
import { accountantRefusal } from '@/lib/accountant/rules';
import { REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from '@/lib/accountant/headers';

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as { id: string; name?: string | null; email?: string | null };
}

/**
 * The one place a request is resolved to a company.
 *
 * Both public helpers below go through this, because two lookups that could
 * disagree about which company is active is exactly how a cross-tenant leak
 * starts: a route authorised against one company while reading another.
 *
 * `user: { isActive: true }` revokes access for a deactivated account on its
 * existing session too, not only at the next login — in the same query, with no
 * extra round-trip.
 *
 * The ordering is explicit. Without it `findMany` returns rows in whatever order
 * Postgres likes, so a user with two companies and no stored choice could land
 * on a different one between requests. Oldest membership first means the company
 * someone started with stays their default; `id` breaks a tie between two
 * memberships created in the same transaction.
 *
 * The cookie only ever selects from what this query returned, so a value naming
 * a company the user has no membership for is discarded — see
 * `resolveActiveCompanyId`.
 */
async function resolveMembershipForUser(userId: string): Promise<{ companyId: string; role: string } | null> {
  const memberships = await prisma.companyMember.findMany({
    where: { userId, user: { isActive: true } },
    select: { companyId: true, role: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const companyId = resolveActiveCompanyId(memberships, cookies().get(ACTIVE_COMPANY_COOKIE)?.value);
  if (!companyId) return null;
  const role = memberships.find((m) => m.companyId === companyId)?.role ?? 'owner';
  return { companyId, role };
}

async function resolveCompanyIdForUser(userId: string): Promise<string | null> {
  return (await resolveMembershipForUser(userId))?.companyId ?? null;
}

/**
 * The signed-in user's role in their active company ("owner", "accountant",
 * …), or null. For layouts and pages that adapt to a read-only member.
 */
export async function getActiveMembership(): Promise<{ companyId: string; role: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return resolveMembershipForUser(user.id);
}

export async function getUserCompanyId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return resolveCompanyIdForUser(user.id);
}

/**
 * Strict auth + company helper. Returns user & companyId or an error response.
 * NEVER returns a null companyId — if the user has no company, returns 403.
 * All company-scoped API routes MUST use this.
 *
 * The companyId it returns is the user's active company: their stored selection
 * when they hold a membership for it, and otherwise their first membership,
 * which is what every single-company user gets and what this always returned.
 * It is never taken from a request body, query string or header.
 */
export async function requireUserCompany(): Promise<
  | { error: NextResponse; user: null; companyId: null; role: null }
  | { error: null; user: { id: string; name?: string | null; email?: string | null }; companyId: string; role: string }
> {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null, companyId: null, role: null };
  }

  const membership = await resolveMembershipForUser(user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: 'No company access' }, { status: 403 }), user: null, companyId: null, role: null };
  }

  // Accountants are read-only, enforced here for every company-scoped route:
  // only GET/HEAD pass, and billing is closed to them entirely. The method and
  // path come from headers the middleware always overwrites; if they are
  // missing the check refuses (fails closed).
  const h = headers();
  const refusal = accountantRefusal({
    role: membership.role,
    method: h.get(REQUEST_METHOD_HEADER),
    pathname: h.get(REQUEST_PATH_HEADER),
  });
  if (refusal) {
    return {
      error: NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status }),
      user: null,
      companyId: null,
      role: null,
    };
  }
  return { error: null, user, companyId: membership.companyId, role: membership.role };
}

/**
 * Every company the signed-in user belongs to, oldest membership first.
 *
 * Same query and same ordering as the resolution above, so the switcher can
 * only ever offer companies that `requireUserCompany` would actually honour.
 */
export async function getUserCompanies(): Promise<
  Array<{ id: string; name: string; logoUrl: string | null; role: string }>
> {
  const user = await getSessionUser();
  if (!user) return [];

  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id, user: { isActive: true } },
    select: {
      role: true,
      company: { select: { id: true, name: true, logoUrl: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    logoUrl: m.company.logoUrl,
    role: m.role,
  }));
}

/** Legacy alias kept only for non-company routes (signup pre-check). Prefer requireUserCompany(). */
export async function requireAuth() {
  return requireUserCompany();
}

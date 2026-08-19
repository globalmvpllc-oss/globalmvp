import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as { id: string; name?: string | null; email?: string | null };
}

export async function getUserCompanyId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const member = await prisma.companyMember.findFirst({
    where: { userId: user.id },
    select: { companyId: true },
  });
  return member?.companyId ?? null;
}

/**
 * Strict auth + company helper. Returns user & companyId or an error response.
 * NEVER returns a null companyId — if the user has no company, returns 403.
 * All company-scoped API routes MUST use this.
 */
export async function requireUserCompany(): Promise<
  | { error: NextResponse; user: null; companyId: null }
  | { error: null; user: { id: string; name?: string | null; email?: string | null }; companyId: string }
> {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null, companyId: null };
  }
  const member = await prisma.companyMember.findFirst({
    where: { userId: user.id },
    select: { companyId: true },
  });
  if (!member?.companyId) {
    return { error: NextResponse.json({ error: 'No company access' }, { status: 403 }), user: null, companyId: null };
  }
  return { error: null, user, companyId: member.companyId };
}

/** Legacy alias kept only for non-company routes (signup pre-check). Prefer requireUserCompany(). */
export async function requireAuth() {
  return requireUserCompany();
}

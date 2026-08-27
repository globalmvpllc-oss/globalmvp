export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * Grant or revoke a company's plan without a Polar purchase.
 *
 * Writes only Company.grantedPlan / grantedPlanUntil / grantedPlanReason — never
 * the Subscription row, which the Polar webhook owns and would overwrite. A real
 * Polar subscription always wins over a grant (see lib/billing/granted-plan.ts).
 * Server-authorised and audited, with the reason recorded.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const body = (await request.json().catch(() => null)) as
      | { plan?: unknown; until?: unknown; reason?: unknown }
      | null;

    const rawPlan = body?.plan;
    const clearing = rawPlan === null || rawPlan === '' || rawPlan === undefined;
    if (!clearing && rawPlan !== 'pro' && rawPlan !== 'business') {
      return NextResponse.json({ error: 'Choose Pro or Business, or clear the grant.' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    });
    if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

    let until: Date | null = null;
    if (!clearing && typeof body?.until === 'string' && body.until.trim() !== '') {
      const parsed = new Date(body.until);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'That expiry date is not valid.' }, { status: 400 });
      }
      until = parsed;
    }
    const reason =
      typeof body?.reason === 'string' && body.reason.trim() !== ''
        ? body.reason.trim().slice(0, 200)
        : null;

    await prisma.company.update({
      where: { id: company.id },
      data: clearing
        ? { grantedPlan: null, grantedPlanUntil: null, grantedPlanReason: null }
        : { grantedPlan: rawPlan as string, grantedPlanUntil: until, grantedPlanReason: reason },
    });

    await recordAudit({
      admin: gate.admin,
      action: clearing ? 'admin.company.plan_revoked' : 'admin.company.plan_granted',
      entityType: 'company',
      entityId: company.id,
      companyId: company.id,
      request,
      metadata: clearing
        ? { company: company.name }
        : { plan: rawPlan, until: until?.toISOString() ?? null, reason },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('admin:companies:plan', error, {
      fallbackMessage: 'Could not update the granted plan.',
    });
  }
}

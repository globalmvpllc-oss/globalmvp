import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentPlan } from './access';
import { effectivePlan } from './trial';
import { PLAN_LIMITS, isOverLimit, limitFor, type LimitedResource } from './features';
import type { Plan } from './plans';

/**
 * Plan limits, enforced where it counts.
 *
 * Hiding a button is presentation. This runs inside the POST handlers, so a
 * caller with curl is subject to the same ceiling as a caller with a browser.
 *
 * The plan is read from the company's own subscription row every time. It is
 * never taken from the request: a body carrying `plan: "business"` changes
 * nothing here.
 */

/** Start of the current month, in UTC. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of next month, in UTC — the exclusive upper bound. */
export function monthEnd(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * The month window every monthly limit is measured against.
 *
 * UTC, and half-open [start, end), matching how the calendar and its range
 * helper already treat dates. Using the server's local month instead would put
 * a record either side of the boundary depending on where the process runs,
 * which is how someone ends up blocked on the 1st or given a free extra day.
 */
export function currentMonthRange(now: Date = new Date()): { gte: Date; lt: Date } {
  return { gte: monthStart(now), lt: monthEnd(now) };
}

/**
 * Resolves the company's effective plan.
 *
 * A purchased subscription wins; otherwise the first-15-days Pro trial (derived
 * from Company.createdAt) substitutes for Free while it is open. Limits below
 * are then measured against this effective plan, so a company on trial gets the
 * Pro allowances server-side, not just in the UI.
 */
export async function getCurrentPlan(companyId: string): Promise<Plan> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      createdAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          trialEndsAt: true,
        },
      },
    },
  });
  const paid = currentPlan(company?.subscription ?? null);
  return effectivePlan(paid, company?.createdAt ?? null);
}

/** Counts what the company already has for a resource in the relevant window. */
async function countUsage(companyId: string, resource: LimitedResource): Promise<number> {
  const range = currentMonthRange();

  switch (resource) {
    case 'customers':
      // Not monthly: a ceiling on how many exist at once.
      return prisma.customer.count({ where: { companyId } });
    case 'invoicesPerMonth':
      return prisma.invoice.count({ where: { companyId, createdAt: range } });
    case 'incomePerMonth':
      return prisma.incomeTransaction.count({ where: { companyId, createdAt: range } });
    case 'expensesPerMonth':
      return prisma.expenseTransaction.count({ where: { companyId, createdAt: range } });
    case 'invoicePdfPerMonth':
      // No usage table exists, so PDF volume is approximated by the invoices
      // created this month. Stated plainly in the report rather than presented
      // as an exact meter.
      return prisma.invoice.count({ where: { companyId, createdAt: range } });
  }
}

export interface LimitVerdict {
  allowed: boolean;
  plan: Plan;
  limit: number | null;
  current: number;
}

/** Whether one more record would exceed the plan's allowance. */
export async function checkPlanLimit(
  companyId: string,
  resource: LimitedResource
): Promise<LimitVerdict> {
  const plan = await getCurrentPlan(companyId);
  const limit = limitFor(plan, resource);

  // Unlimited: no count needed, so Business pays no query cost for a ceiling
  // it does not have.
  if (limit === null) return { allowed: true, plan, limit: null, current: 0 };

  const current = await countUsage(companyId, resource);
  return { allowed: !isOverLimit(plan, resource, current), plan, limit, current };
}

/**
 * Machine-readable refusal.
 *
 * 402 Payment Required rather than 403: the request was authorised, the plan
 * simply does not cover it. The body carries the numbers so the client can say
 * "20 of 20 this month" instead of a generic failure, and `code` lets it show
 * the right upgrade prompt without parsing prose.
 */
export function limitReachedResponse(resource: LimitedResource, verdict: LimitVerdict) {
  return NextResponse.json(
    {
      error: 'Plan limit reached',
      code: 'PLAN_LIMIT_REACHED',
      resource,
      plan: verdict.plan,
      limit: verdict.limit,
      current: verdict.current,
    },
    { status: 402 }
  );
}

/**
 * Guard for a POST handler: returns a response to send, or null to continue.
 *
 *   const denied = await enforcePlanLimit(companyId, 'invoicesPerMonth');
 *   if (denied) return denied;
 */
export async function enforcePlanLimit(companyId: string, resource: LimitedResource) {
  const verdict = await checkPlanLimit(companyId, resource);
  return verdict.allowed ? null : limitReachedResponse(resource, verdict);
}

export { PLAN_LIMITS };

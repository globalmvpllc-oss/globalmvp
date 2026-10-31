import type { PaidPlan } from './plans';

/**
 * Moving an existing subscription between paid plans.
 *
 * A second checkout is the wrong tool for this: Polar refuses it with "You
 * already have an active subscription", and even if it did not, the customer
 * would end up paying for two plans. The subscription itself is moved instead,
 * with Polar's update endpoint (PATCH /v1/subscriptions/{id}).
 *
 * Pure rules only — no Polar client, no Prisma — so each decision can be
 * asserted in a unit test. The route does the I/O.
 *
 * Proration, from Polar's documentation (Subscriptions › Proration):
 *
 *   - `invoice`: the subscription changes immediately and the prorated
 *     difference is invoiced and charged right away. If that payment fails
 *     the API returns an error and the subscription is left unchanged.
 *   - `next_period`: the change is scheduled as a pending update and applied
 *     at the start of the next billing period. No charge, no credit.
 *
 * Upgrades use `invoice` (the customer gets the bigger plan now and pays the
 * difference now); downgrades use `next_period` (they keep what they paid for
 * until the period they paid for ends).
 */

const PLAN_RANK: Record<PaidPlan, number> = { pro: 1, business: 2 };

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

export function classifyPlanChange(current: PaidPlan, target: PaidPlan): PlanChangeDirection {
  const diff = PLAN_RANK[target] - PLAN_RANK[current];
  if (diff > 0) return 'upgrade';
  if (diff < 0) return 'downgrade';
  return 'same';
}

export type ProrationBehavior = 'invoice' | 'next_period';

export function prorationBehaviorFor(direction: Exclude<PlanChangeDirection, 'same'>): ProrationBehavior {
  return direction === 'upgrade' ? 'invoice' : 'next_period';
}

/** Statuses a plan can be changed from. Anything else has no live billing to move. */
const CHANGEABLE_STATUSES = new Set(['active', 'trialing']);

export type PlanChangeBlocker = 'not_active' | 'cancel_scheduled';

/**
 * Why a stored subscription cannot be moved, or null when it can.
 *
 * Polar itself rejects a plan change on a subscription that is cancelled or
 * scheduled to cancel ("uncancel first"); checking here turns that into a
 * clear message instead of a provider error.
 */
export function planChangeBlocker(sub: {
  status: string;
  cancelAtPeriodEnd: boolean;
}): PlanChangeBlocker | null {
  if (!CHANGEABLE_STATUSES.has(sub.status)) return 'not_active';
  if (sub.cancelAtPeriodEnd) return 'cancel_scheduled';
  return null;
}

/**
 * Estimate of what an immediate upgrade charges today, in minor units.
 *
 * Polar has no endpoint that previews a proration, so the confirmation screen
 * shows an estimate built from Polar's published formula, which prorates per
 * second over the current period:
 *
 *   credit for the unused old plan  = oldPrice × remaining / total
 *   charge for the rest on new plan = newPrice × remaining / total
 *   due today                       = charge − credit
 *
 * Polar computes the real figure when the change is made; that figure is read
 * back from the resulting order and is what the customer is told afterwards.
 *
 * Returns null when the inputs cannot produce an honest number: a period that
 * has not started, has already ended, or is malformed.
 */
export function estimateUpgradeCharge(input: {
  currentAmountMinor: number;
  targetAmountMinor: number;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}): number | null {
  const { currentAmountMinor, targetAmountMinor, periodStart, periodEnd } = input;
  const now = input.now ?? new Date();

  if (![currentAmountMinor, targetAmountMinor].every((n) => Number.isFinite(n) && n >= 0)) return null;

  const total = periodEnd.getTime() - periodStart.getTime();
  const remaining = periodEnd.getTime() - now.getTime();
  if (!(total > 0) || remaining <= 0 || remaining > total) return null;

  const fraction = remaining / total;
  const due = Math.round((targetAmountMinor - currentAmountMinor) * fraction);
  return Math.max(0, due);
}

/**
 * Picks the order Polar raised for this plan change out of a list of the
 * subscription's recent orders.
 *
 * Polar marks it with billing reason `subscription_update`. Only an order
 * created at or after the moment the change was requested qualifies (with a
 * small allowance for clock skew), so an older upgrade's order is never
 * reported as today's charge.
 */
export function findPlanChangeOrder<
  T extends { billingReason: string; createdAt: Date | string; totalAmount: number; currency: string; id: string },
>(orders: T[], requestedAt: Date, skewMs = 60_000): T | null {
  const floor = requestedAt.getTime() - skewMs;
  for (const order of orders) {
    const created = new Date(order.createdAt).getTime();
    if (order.billingReason === 'subscription_update' && Number.isFinite(created) && created >= floor) {
      return order;
    }
  }
  return null;
}

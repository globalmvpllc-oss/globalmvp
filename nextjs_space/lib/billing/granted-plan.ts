import type { Plan } from './plans';
import { currentPlan, type SubscriptionLike } from './access';
import { effectivePlan } from './trial';

/**
 * How a company's plan is resolved, in one place.
 *
 * Order, and why:
 *   1. An active Polar subscription always wins — the customer is paying.
 *   2. Otherwise an admin grant, if it has no expiry or has not expired. Grants
 *      live on Company, never on Subscription, because the Polar webhook owns
 *      that table and would overwrite anything written there.
 *   3. Otherwise Free — which the automatic first-15-days trial may still lift
 *      to Pro (see ./trial).
 *
 * Pure, so the precedence can be tested without Prisma.
 */

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A grant with no expiry (null) is open-ended; otherwise it must be in the future. */
export function isGrantActive(
  grantedPlanUntil: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (grantedPlanUntil === null || grantedPlanUntil === undefined) return true;
  const until = toDate(grantedPlanUntil);
  if (!until) return false; // unparseable expiry: treat as inactive, fail closed
  return until.getTime() > now.getTime();
}

/** Narrows a stored grant value to a real plan, or null. */
export function grantedPlanValue(grantedPlan: string | null | undefined): Plan | null {
  return grantedPlan === 'pro' || grantedPlan === 'business' ? grantedPlan : null;
}

export interface PlanInputs {
  subscription: SubscriptionLike | null | undefined;
  grantedPlan: string | null | undefined;
  grantedPlanUntil: Date | string | null | undefined;
  companyCreatedAt: Date | string | null | undefined;
}

/** The effective plan, applying the order above. */
export function resolvePlan(inputs: PlanInputs, now: Date = new Date()): Plan {
  // 1. Active Polar subscription.
  const paid = currentPlan(inputs.subscription, now);
  if (paid !== 'free') return paid;

  // 2. Admin grant, if still in force.
  const granted = grantedPlanValue(inputs.grantedPlan);
  if (granted && isGrantActive(inputs.grantedPlanUntil, now)) return granted;

  // 3. Free — possibly lifted to Pro by the automatic trial.
  return effectivePlan('free', inputs.companyCreatedAt, now);
}

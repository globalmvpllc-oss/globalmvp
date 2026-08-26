import type { Plan } from './plans';

/**
 * What a subscription grants, decided in exactly one place.
 *
 * Every route or screen that needs to know whether a company is entitled to
 * something asks these functions. Spreading the rule across call sites is how
 * one of them ends up locking out a paying customer — or letting a revoked one
 * through.
 *
 * Pure: no Prisma, no network, no environment. It takes the fields already on
 * the Subscription row and answers a question, so the rule can be tested
 * directly.
 */

/** Statuses mirrored from Polar. */
export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'revoked',
  'incomplete',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The subset of a Subscription row this module needs.
 *
 * Structural rather than the Prisma type, so these functions do not drag a
 * generated client into anything that imports them — including tests.
 */
export interface SubscriptionLike {
  plan: string;
  status: string;
  currentPeriodEnd: Date | string;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: Date | string | null;
}

/**
 * Statuses that still grant access.
 *
 * `past_due` is deliberately included. A failed renewal usually means an
 * expired card, and Polar retries for days; cutting someone out of their own
 * bookkeeping the moment a charge bounces loses the customer faster than it
 * recovers the payment. Access ends at `revoked`, which is Polar's own verdict
 * that recovery failed.
 *
 * `canceled` is also included, because Polar marks a subscription canceled as
 * soon as the user asks to stop while the paid period continues. What actually
 * ends access is `currentPeriodEnd` passing, checked below.
 */
const ENTITLED_STATUSES: readonly string[] = ['trialing', 'active', 'past_due', 'canceled'];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether a company currently has paid access.
 *
 * Two conditions, both required: the status is one that grants access, and the
 * paid period has not run out. `null` means no subscription row at all, which
 * is the Free plan.
 */
export function hasPaidAccess(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (!ENTITLED_STATUSES.includes(subscription.status)) return false;

  const periodEnd = toDate(subscription.currentPeriodEnd);
  // An unparseable period end is treated as expired: failing closed is the
  // safer default for a corrupt row, and it is visible rather than silent.
  if (!periodEnd) return false;

  return periodEnd.getTime() > now.getTime();
}

/** The plan a company is effectively on right now. */
export function currentPlan(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date()
): Plan {
  if (!hasPaidAccess(subscription, now)) return 'free';
  const plan = subscription!.plan;
  return plan === 'pro' || plan === 'business' ? plan : 'free';
}

/** Plans ordered by capability, for "at least this plan" checks. */
const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, business: 2 };

/**
 * Whether a company meets a minimum plan.
 *
 * The gate for future paid features. Enforced server-side when it is used —
 * hiding a control in the UI is presentation, not a limit.
 *
 * Nothing calls this yet: no existing feature is being restricted. Taking away
 * something a customer already uses for free costs more than it earns.
 */
export function meetsPlan(
  subscription: SubscriptionLike | null | undefined,
  required: Plan,
  now: Date = new Date()
): boolean {
  return PLAN_RANK[currentPlan(subscription, now)] >= PLAN_RANK[required];
}

export type BillingState =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceling'
  | 'expired';

/**
 * A single value describing what the billing screen should say.
 *
 * Keeps the branching out of the component: the screen renders a label per
 * state instead of re-deriving the rules from raw status fields.
 */
export function billingState(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date()
): BillingState {
  if (!subscription) return 'free';
  if (!hasPaidAccess(subscription, now)) return 'expired';

  if (subscription.status === 'past_due') return 'past_due';
  if (subscription.status === 'canceled' || subscription.cancelAtPeriodEnd) return 'canceling';
  if (subscription.status === 'trialing') return 'trialing';
  return 'active';
}

/**
 * Whole days remaining in the current period, floored, never negative.
 *
 * Used for "trial ends in N days" and "cancels in N days". Floored because
 * telling someone they have 3 days left when 3.9 remain is the safe rounding.
 */
export function daysRemaining(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date()
): number | null {
  const periodEnd = toDate(subscription?.currentPeriodEnd);
  if (!periodEnd) return null;
  const ms = periodEnd.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

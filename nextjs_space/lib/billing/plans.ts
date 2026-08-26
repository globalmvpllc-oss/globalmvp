/**
 * Plans, and how Polar's price ids map onto them.
 *
 * There is no `Plan` or `Price` table. Two plans and four prices do not justify
 * a second source of truth that drifts the moment a price changes in Polar;
 * the ids live in the environment and the mapping lives here.
 *
 * Nothing in this file talks to Polar or reads a secret — it is pure lookup, so
 * it can be unit-tested without network access or an SDK.
 */

/** Paid plans. Free is the absence of a subscription, not a value here. */
export const PAID_PLANS = ['pro', 'business'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** What a company is on, including the unsubscribed case. */
export type Plan = 'free' | PaidPlan;

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/**
 * Environment variable holding the Polar price id for each plan and interval.
 *
 * Server-only by design: none is prefixed `NEXT_PUBLIC_`, so a price id is
 * never shipped to the browser and a client cannot name one.
 */
const PRICE_ENV_VARS: Record<PaidPlan, Record<BillingInterval, string>> = {
  pro: {
    month: 'POLAR_PRO_PRICE_MONTHLY',
    year: 'POLAR_PRO_PRICE_YEARLY',
  },
  business: {
    month: 'POLAR_BUSINESS_PRICE_MONTHLY',
    year: 'POLAR_BUSINESS_PRICE_YEARLY',
  },
};

/** Narrows an arbitrary value to a paid plan. */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);
}

/** Narrows an arbitrary value to a billing interval. */
export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === 'string' && (BILLING_INTERVALS as readonly string[]).includes(value);
}

/**
 * The configured Polar price id for a plan and interval.
 *
 * Returns null when the variable is unset rather than throwing, so a caller can
 * answer "billing is not configured" with a 503 instead of a stack trace. The
 * environment is read through the passed-in object so tests need not mutate
 * `process.env`.
 */
export function priceIdFor(
  plan: PaidPlan,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env
): string | null {
  const value = env[PRICE_ENV_VARS[plan][interval]];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export interface PlanSelection {
  plan: PaidPlan;
  interval: BillingInterval;
}

/**
 * Resolves a Polar price id back to the plan it represents.
 *
 * Used when a webhook reports a subscription: the plan stored on the row is
 * derived from the price Polar charged, never from anything a client sent.
 * An unrecognised id returns null — better an explicit gap than silently
 * recording someone on a plan they did not buy.
 */
export function planForPriceId(
  priceId: unknown,
  env: Record<string, string | undefined> = process.env
): PlanSelection | null {
  if (typeof priceId !== 'string' || priceId.trim() === '') return null;
  const needle = priceId.trim();

  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (priceIdFor(plan, interval, env) === needle) return { plan, interval };
    }
  }
  return null;
}

/**
 * Whether checkout can run at all.
 *
 * Checked before starting a session so an unconfigured deployment answers
 * "billing is unavailable" rather than failing somewhere inside a Polar call.
 */
export function isBillingConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_WEBHOOK_SECRET) return false;
  return PAID_PLANS.every((plan) =>
    BILLING_INTERVALS.every((interval) => priceIdFor(plan, interval, env) !== null)
  );
}

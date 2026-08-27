/**
 * Plans, and how Polar's ids map onto them.
 *
 * There is no `Plan` or `Price` table. Two plans and four prices do not justify
 * a second source of truth that drifts the moment a price changes in Polar;
 * the ids live in the environment and the mapping lives here.
 *
 * Two distinct Polar identifiers matter here, and they are NOT interchangeable:
 *
 *   - PRODUCT id — what checkout charges against
 *     (`checkouts.create({ products })`) and what the pricing panel reads
 *     (`products.get({ id })`). Held in the POLAR_*_PRICE_* variables. The name
 *     is historical; the value is a Polar product id.
 *
 *   - PRICE id — what a subscription webhook reports as the price actually
 *     charged. Held, optionally, in the POLAR_*_PRICE_ID_* variables. When they
 *     are unset the webhook falls back to matching the product id, so a
 *     deployment that only has the product ids keeps working.
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
 * Environment variables holding the Polar PRODUCT id for each plan and interval.
 *
 * Server-only by design: none is prefixed `NEXT_PUBLIC_`, so an id is never
 * shipped to the browser and a client cannot name one. The *_PRICE_* names are
 * kept for backward compatibility; the values are product ids.
 */
const PRODUCT_ENV_VARS: Record<PaidPlan, Record<BillingInterval, string>> = {
  pro: {
    month: 'POLAR_PRO_PRICE_MONTHLY',
    year: 'POLAR_PRO_PRICE_YEARLY',
  },
  business: {
    month: 'POLAR_BUSINESS_PRICE_MONTHLY',
    year: 'POLAR_BUSINESS_PRICE_YEARLY',
  },
};

/**
 * Optional environment variables holding the Polar PRICE id for each plan and
 * interval. Used only to attribute a subscription webhook to a plan by the
 * exact price charged. Absent by default — the webhook falls back to the
 * product id above, so these need not be set for billing to work.
 */
const PRICE_ID_ENV_VARS: Record<PaidPlan, Record<BillingInterval, string>> = {
  pro: {
    month: 'POLAR_PRO_PRICE_ID_MONTHLY',
    year: 'POLAR_PRO_PRICE_ID_YEARLY',
  },
  business: {
    month: 'POLAR_BUSINESS_PRICE_ID_MONTHLY',
    year: 'POLAR_BUSINESS_PRICE_ID_YEARLY',
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

/** Reads one id from a given env-var map, treating a blank value as unset. */
function readId(
  map: Record<PaidPlan, Record<BillingInterval, string>>,
  plan: PaidPlan,
  interval: BillingInterval,
  env: Record<string, string | undefined>
): string | null {
  const value = env[map[plan][interval]];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The configured Polar PRODUCT id for a plan and interval.
 *
 * Used by checkout (`checkouts.create({ products })`) and the pricing panel
 * (`products.get({ id })`). Returns null when the variable is unset rather than
 * throwing, so a caller can answer "billing is not configured" with a 503
 * instead of a stack trace. The environment is read through the passed-in
 * object so tests need not mutate `process.env`.
 */
export function productIdFor(
  plan: PaidPlan,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env
): string | null {
  return readId(PRODUCT_ENV_VARS, plan, interval, env);
}

/**
 * Backward-compatible alias. Historically named `priceIdFor`, but the value it
 * returns is a Polar PRODUCT id, not a price id.
 */
export const priceIdFor = productIdFor;

/**
 * The configured Polar PRICE id for a plan and interval, or null when the
 * dedicated variable is unset. Optional: the webhook falls back to the product
 * id when this is absent.
 */
export function polarPriceIdFor(
  plan: PaidPlan,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env
): string | null {
  return readId(PRICE_ID_ENV_VARS, plan, interval, env);
}

export interface PlanSelection {
  plan: PaidPlan;
  interval: BillingInterval;
}

/** Reverse lookup of an id against a given env-var map. */
function planForId(
  map: Record<PaidPlan, Record<BillingInterval, string>>,
  id: unknown,
  env: Record<string, string | undefined>
): PlanSelection | null {
  if (typeof id !== 'string' || id.trim() === '') return null;
  const needle = id.trim();

  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (readId(map, plan, interval, env) === needle) return { plan, interval };
    }
  }
  return null;
}

/**
 * Resolves an id against the PRODUCT-id variables.
 *
 * Those variables hold product ids in production, so this attributes a
 * subscription by its product id. In deployments (and tests) where the same
 * variables happen to hold price ids, a price id resolves here too — which is
 * why the webhook tries this with both the price id and the product id.
 *
 * An unrecognised id returns null — better an explicit gap than silently
 * recording someone on a plan they did not buy.
 */
export function planForConfiguredId(
  id: unknown,
  env: Record<string, string | undefined> = process.env
): PlanSelection | null {
  return planForId(PRODUCT_ENV_VARS, id, env);
}

/**
 * Backward-compatible alias for `planForConfiguredId`.
 *
 * Used when a webhook reports a subscription: the plan stored on the row is
 * derived from the id Polar charged, never from anything a client sent.
 */
export const planForPriceId = planForConfiguredId;

/**
 * Resolves a real Polar PRICE id against the dedicated PRICE-id variables.
 *
 * Returns null when the dedicated variables are unset, so the webhook can fall
 * back to product-id matching. This is the precise path: when configured, a
 * subscription is attributed by the exact price it was charged.
 */
export function planForPolarPriceId(
  id: unknown,
  env: Record<string, string | undefined> = process.env
): PlanSelection | null {
  return planForId(PRICE_ID_ENV_VARS, id, env);
}

/**
 * Whether checkout can run at all.
 *
 * Requires the token, the webhook secret and all four PRODUCT ids. The
 * dedicated price-id variables are optional and deliberately not required here:
 * without them the webhook still attributes subscriptions by product id.
 *
 * Checked before starting a session so an unconfigured deployment answers
 * "billing is unavailable" rather than failing somewhere inside a Polar call.
 */
export function isBillingConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_WEBHOOK_SECRET) return false;
  return PAID_PLANS.every((plan) =>
    BILLING_INTERVALS.every((interval) => productIdFor(plan, interval, env) !== null)
  );
}

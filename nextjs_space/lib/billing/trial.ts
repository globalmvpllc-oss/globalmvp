import type { Plan } from './plans';

/**
 * The automatic Pro trial.
 *
 * A person gets Pro for 15 days to evaluate the product — once. The window runs
 * from the *trial anchor*: the creation date of the earliest company its owner
 * has ever had, resolved by `./trial-anchor`, not the creation date of the
 * company being asked about.
 *
 * That distinction is the whole point. While a user could hold exactly one
 * company, anchoring to `Company.createdAt` was the same thing. Once a user can
 * hold several, it stopped being: create a company, use Pro free for 15 days,
 * create another, repeat — unlimited Pro, never paying. A second company now
 * falls inside the first company's window if it is still open, and outside it if
 * it has closed.
 *
 * There is still no trial row, no flag and no schema change, so nothing a client
 * sends can start, extend or reset it. The window remains a fixed function of
 * server-owned timestamps.
 *
 * A purchased plan always wins: the trial only ever substitutes for Free, and
 * only while it is open. Once the window closes the company is Free again unless
 * it has bought a plan. Nothing is charged when the trial ends — Polar is the
 * only thing that ever charges, and only after a real checkout.
 *
 * Unrelated to `Subscription.trialEndsAt`, which is Polar's own field for a
 * purchased subscription. Two different things; they are never merged.
 *
 * Pure: no Prisma, no environment, so the rule can be tested directly. The
 * functions take a timestamp and go on taking one — only which timestamp the
 * callers pass has changed.
 */

/** Length of the trial, in days. */
export const TRIAL_DAYS = 15;

const DAY_MS = 86_400_000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * When the trial ends: anchor + 15 days.
 *
 * Returns null when the anchor is missing or unparseable, so a caller can tell
 * "no trial" from "trial over" rather than inventing a date.
 */
export function trialEndsAt(trialAnchor: Date | string | null | undefined): Date | null {
  const anchored = toDate(trialAnchor);
  if (!anchored) return null;
  return new Date(anchored.getTime() + TRIAL_DAYS * DAY_MS);
}

/** Whether the trial window is still open. */
export function isTrialActive(
  trialAnchor: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const ends = trialEndsAt(trialAnchor);
  if (!ends) return false;
  return ends.getTime() > now.getTime();
}

/**
 * Whole days left in the trial, floored, never negative.
 *
 * Null when there is no usable anchor. Floored because telling someone 3 days
 * when 3.9 remain is the safe rounding.
 */
export function trialDaysRemaining(
  trialAnchor: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  const ends = trialEndsAt(trialAnchor);
  if (!ends) return null;
  const ms = ends.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / DAY_MS);
}

/**
 * The plan a company is effectively on, trial included.
 *
 * A purchased plan (`pro` or `business`) is returned unchanged — a purchase
 * always wins over the trial. Only when the company is on Free does the trial
 * apply, substituting `pro` while the window is open and falling back to `free`
 * once it closes. The trial never grants `business`.
 */
export function effectivePlan(
  paidPlan: Plan,
  trialAnchor: Date | string | null | undefined,
  now: Date = new Date()
): Plan {
  if (paidPlan !== 'free') return paidPlan;
  return isTrialActive(trialAnchor, now) ? 'pro' : 'free';
}

/**
 * Whether the company's effective Pro access comes from the trial rather than a
 * purchase. False for any paid plan, so a paying customer is never shown as
 * "on trial".
 */
export function isOnTrial(
  paidPlan: Plan,
  trialAnchor: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  return paidPlan === 'free' && isTrialActive(trialAnchor, now);
}

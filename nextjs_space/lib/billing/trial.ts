import type { Plan } from './plans';

/**
 * The automatic Pro trial.
 *
 * Every company gets Pro for its first 15 days, derived purely from
 * Company.createdAt — there is no trial row, no flag and no schema change, so
 * nothing a client sends can start, extend or reset it. The window is a fixed
 * function of a server-owned timestamp.
 *
 * A purchased plan always wins: the trial only ever substitutes for Free, and
 * only while it is open. Once the window closes the company is Free again unless
 * it has bought a plan. Nothing is charged when the trial ends — Polar is the
 * only thing that ever charges, and only after a real checkout.
 *
 * Pure: no Prisma, no environment, so the rule can be tested directly.
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
 * When the trial ends: createdAt + 15 days.
 *
 * Returns null when createdAt is missing or unparseable, so a caller can tell
 * "no trial" from "trial over" rather than inventing a date.
 */
export function trialEndsAt(companyCreatedAt: Date | string | null | undefined): Date | null {
  const created = toDate(companyCreatedAt);
  if (!created) return null;
  return new Date(created.getTime() + TRIAL_DAYS * DAY_MS);
}

/** Whether the trial window is still open. */
export function isTrialActive(
  companyCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const ends = trialEndsAt(companyCreatedAt);
  if (!ends) return false;
  return ends.getTime() > now.getTime();
}

/**
 * Whole days left in the trial, floored, never negative.
 *
 * Null when there is no usable creation date. Floored because telling someone 3
 * days when 3.9 remain is the safe rounding.
 */
export function trialDaysRemaining(
  companyCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  const ends = trialEndsAt(companyCreatedAt);
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
  companyCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): Plan {
  if (paidPlan !== 'free') return paidPlan;
  return isTrialActive(companyCreatedAt, now) ? 'pro' : 'free';
}

/**
 * Whether the company's effective Pro access comes from the trial rather than a
 * purchase. False for any paid plan, so a paying customer is never shown as
 * "on trial".
 */
export function isOnTrial(
  paidPlan: Plan,
  companyCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  return paidPlan === 'free' && isTrialActive(companyCreatedAt, now);
}

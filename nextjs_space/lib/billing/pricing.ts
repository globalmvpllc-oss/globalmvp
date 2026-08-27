import type { PaidPlan, BillingInterval } from './plans';

/**
 * Plan price shapes and the yearly-discount arithmetic.
 *
 * Deliberately free of I/O and of `server-only`, so the arithmetic below can be
 * tested directly. Fetching lives in ./pricing-server.ts.
 *
 * Real plan prices are read from Polar.
 *
 * The environment holds product *ids*, not amounts — nothing in this codebase
 * knows what Pro costs. Writing a number into the source would be inventing a
 * price, and the moment it diverged from Polar the page would be quoting one
 * figure while charging another. So the amounts come from the same place the
 * charge does.
 *
 * Every field here is optional on purpose: if Polar is unreachable or not
 * configured, the plan cards still render without prices rather than failing.
 */

export interface PlanPrice {
  /** Major units — Polar reports minor units, e.g. 999 for 9.99. */
  amount: number;
  currency: string;
}

export type PlanPrices = {
  [P in PaidPlan]: Partial<Record<BillingInterval, PlanPrice>>;
};

export interface PlanPricing {
  prices: PlanPrices;
  /** True when at least one price was retrieved. */
  available: boolean;
}

export interface YearlySaving {
  /** What twelve monthly payments would cost. */
  monthlyTotal: number;
  /** What the yearly plan costs. */
  yearlyTotal: number;
  /** Money kept by paying yearly. */
  saved: number;
  /** The yearly price divided across twelve months. */
  perMonth: number;
  /** Whole percent saved, rounded. */
  percent: number;
}

/**
 * The yearly discount, shown as arithmetic rather than a bare badge.
 *
 * `1 - (yearly / (monthly * 12))`. Returns null when the comparison would be
 * meaningless — a missing price, or a yearly plan that costs more — because a
 * negative "saving" is worse than no claim at all.
 */
export function yearlySaving(
  monthly: PlanPrice | undefined,
  yearly: PlanPrice | undefined
): YearlySaving | null {
  if (!monthly || !yearly) return null;
  if (monthly.currency !== yearly.currency) return null;
  if (monthly.amount <= 0 || yearly.amount <= 0) return null;

  const monthlyTotal = monthly.amount * 12;
  if (yearly.amount >= monthlyTotal) return null;

  const saved = monthlyTotal - yearly.amount;
  return {
    monthlyTotal,
    yearlyTotal: yearly.amount,
    saved,
    perMonth: yearly.amount / 12,
    percent: Math.round((1 - yearly.amount / monthlyTotal) * 100),
  };
}

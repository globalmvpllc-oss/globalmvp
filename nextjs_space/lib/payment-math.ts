import Decimal from 'decimal.js';

/**
 * Pure payment arithmetic — no database access.
 *
 * Kept separate from payment-calc.ts (which imports the Prisma client) so this
 * logic can be unit-tested without a live database connection.
 */

/** Any value that stringifies to a decimal literal (Prisma.Decimal, number, string). */
export type DecimalLike = { toString(): string };

/** Sums payment amounts with Decimal — never floating point. */
export function sumPayments(payments: Array<{ amount: DecimalLike }>): Decimal {
  let total = new Decimal(0);
  for (const p of payments) {
    total = total.plus(new Decimal(p.amount.toString()));
  }
  return total;
}

export interface PaymentSummary {
  /** Total already paid. */
  paid: Decimal;
  /** Amount still outstanding (never negative). */
  remaining: Decimal;
  /** True when payments cover the full amount. */
  isFullyPaid: boolean;
}

/** Computes paid/remaining for any payable, using Decimal throughout. */
export function computePaymentSummary(
  total: DecimalLike,
  payments: Array<{ amount: DecimalLike }>
): PaymentSummary {
  const totalDec = new Decimal(total.toString());
  const paid = sumPayments(payments);
  const remaining = Decimal.max(totalDec.minus(paid), new Decimal(0));
  return {
    paid,
    remaining,
    isFullyPaid: paid.gte(totalDec) && totalDec.gt(0),
  };
}

/**
 * Converts a value that arrived over JSON into a number safe for display.
 *
 * Prisma serialises Decimal columns as strings, so `rows.reduce((s, r) => s + r.amount, 0)`
 * silently concatenates instead of adding: 0 + "100.00" + "50.00" produces
 * "0100.0050.00", which formats as NaN. Use this at the boundary where API
 * data is turned into display totals.
 *
 * This is a display helper only. Server-side money arithmetic stays on
 * Decimal — see invoice-calc.ts and computePaymentSummary above.
 */
export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** Sums an amount field across rows, coercing JSON-serialised Decimals safely. */
export function sumAmounts<T>(rows: T[], pick: (row: T) => unknown): number {
  return rows.reduce<number>((total, row) => total + toAmount(pick(row)), 0);
}

/**
 * Sums an amount field per currency.
 *
 * `sumAmounts` deliberately knows nothing about currency, which is correct for
 * a single-currency total but wrong for a list that may hold several: adding a
 * 1000 TRY row to a 100 USD row produces 1100 of nothing. The income and
 * expense summaries did exactly that and then labelled the result with the
 * first row's currency.
 *
 * Returns entries sorted by currency code so the order is stable between
 * renders rather than following insertion order.
 *
 * Grouping only — no conversion is implied, matching how the dashboard and
 * reports already present multi-currency figures.
 */
export function sumAmountsByCurrency<T>(
  rows: T[],
  pickAmount: (row: T) => unknown,
  pickCurrency: (row: T) => unknown,
  fallbackCurrency = 'USD'
): Array<{ currency: string; total: number }> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const raw = pickCurrency(row);
    const currency = typeof raw === 'string' && raw.trim() !== '' ? raw : fallbackCurrency;
    totals.set(currency, (totals.get(currency) ?? 0) + toAmount(pickAmount(row)));
  }

  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

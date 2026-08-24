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

import Decimal from 'decimal.js';
import { sumPayments, type DecimalLike } from '@/lib/payment-math';

/**
 * Arithmetic for editing an existing payment.
 *
 * Creating a payment asks "how much of this invoice is still unpaid?". Editing
 * has to ask a different question: "how much would be unpaid if this payment
 * did not exist?" — otherwise the payment being corrected is counted against
 * itself, and raising a 100 payment to 120 on a 120 invoice is rejected as an
 * overpayment even though it is exactly right.
 *
 * Kept pure and free of Prisma so the overpayment rule can be unit-tested
 * without a database, matching the payment-math / payment-calc split already
 * used here.
 */

export interface PaymentRow {
  id: string;
  amount: DecimalLike;
}

/**
 * Total paid against a target, ignoring one payment.
 *
 * `excludeId` is the payment being edited or deleted. Rows are compared by id,
 * so passing an id that is not present simply returns the full sum.
 */
export function sumPaymentsExcluding(payments: PaymentRow[], excludeId: string): Decimal {
  return sumPayments(payments.filter((p) => p.id !== excludeId));
}

/**
 * How much a payment may be changed to without overpaying its target.
 *
 * Returns the target total minus everything paid by *other* payments. A
 * negative result is clamped to zero: other payments already covering the whole
 * total means this one has no room, not that it owes money back.
 */
export function remainingForEdit(
  targetTotal: DecimalLike,
  payments: PaymentRow[],
  excludeId: string
): Decimal {
  const total = new Decimal(targetTotal?.toString() ?? '0');
  const others = sumPaymentsExcluding(payments, excludeId);
  const remaining = total.minus(others);
  return remaining.lt(0) ? new Decimal(0) : remaining;
}

/** True when a proposed amount would push the target past its total. */
export function isOverpaymentForEdit(
  proposedAmount: DecimalLike,
  targetTotal: DecimalLike,
  payments: PaymentRow[],
  excludeId: string
): boolean {
  const proposed = new Decimal(proposedAmount?.toString() ?? '0');
  return proposed.gt(remainingForEdit(targetTotal, payments, excludeId));
}

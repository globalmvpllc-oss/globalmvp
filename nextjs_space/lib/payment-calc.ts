import Decimal from 'decimal.js';
import { computePaymentSummary, sumPayments } from '@/lib/payment-math';
import { prisma } from '@/lib/db';
import { deriveStatusFromPayments } from '@/lib/invoice-status';

/**
 * Accepts either the global Prisma client or a transaction client, so callers
 * can recalculate inside the same transaction that created/deleted the payment.
 * Structurally equivalent to Prisma.TransactionClient without depending on the
 * generated namespace.
 */
export type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
type Db = TxClient;

// Pure arithmetic lives in payment-math.ts so it can be tested without a DB.
export { sumPayments, computePaymentSummary } from '@/lib/payment-math';
export type { DecimalLike, PaymentSummary } from '@/lib/payment-math';

/**
 * Recalculates an invoice's amountPaid and status from the actual sum of its payments.
 * This is the single source of truth — never trust client-provided amountPaid.
 */
export async function recalculateInvoicePaymentState(
  invoiceId: string,
  db: Db = prisma
): Promise<void> {
  const payments = await db.payment.findMany({
    where: { invoiceId },
    select: { amount: true },
  });

  const sumPaid = sumPayments(payments);

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { total: true, status: true },
  });
  if (!invoice) return;

  const totalDec = new Decimal(invoice.total.toString());
  const newStatus = deriveStatusFromPayments(invoice.status, sumPaid.toNumber(), totalDec.toNumber());

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: sumPaid.toNumber(),
      status: newStatus,
    },
  });
}

/**
 * Recalculates an expense's payment status from its linked payments.
 *
 * Previously this used `payments.length > 0`, which marked a 1000 TRY expense
 * as fully PAID after a 1 TRY payment. Status is now derived by comparing the
 * Decimal sum of payments against the expense amount.
 *
 * ExpenseTransaction.status only supports UNPAID / PAID in the current schema
 * (no PARTIAL value exists), so a partially-paid expense correctly remains
 * UNPAID until the full amount is covered. Callers needing the precise
 * outstanding figure should use `computePaymentSummary`.
 */
export async function recalculateExpensePaymentState(
  expenseId: string,
  db: Db = prisma
): Promise<void> {
  const expense = await db.expenseTransaction.findUnique({
    where: { id: expenseId },
    select: { amount: true },
  });
  if (!expense) return;

  const payments = await db.payment.findMany({
    where: { expenseId },
    select: { amount: true },
  });

  const { isFullyPaid } = computePaymentSummary(expense.amount, payments);

  await db.expenseTransaction.update({
    where: { id: expenseId },
    data: { status: isFullyPaid ? 'PAID' : 'UNPAID' },
  });
}

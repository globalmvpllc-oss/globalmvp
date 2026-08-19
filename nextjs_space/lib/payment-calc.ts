import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { deriveStatusFromPayments } from '@/lib/invoice-status';

/**
 * Recalculates an invoice's amountPaid and status from the actual sum of its payments.
 * This is the single source of truth — never trust client-provided amountPaid.
 */
export async function recalculateInvoicePaymentState(invoiceId: string): Promise<void> {
  const payments = await prisma.payment.findMany({
    where: { invoiceId },
    select: { amount: true },
  });

  let sumPaid = new Decimal(0);
  for (const p of payments) {
    sumPaid = sumPaid.plus(new Decimal(p.amount.toString()));
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { total: true, status: true },
  });
  if (!invoice) return;

  const totalDec = new Decimal(invoice.total.toString());
  const newStatus = deriveStatusFromPayments(invoice.status, sumPaid.toNumber(), totalDec.toNumber());

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: sumPaid.toNumber(),
      status: newStatus,
    },
  });
}

/**
 * Recalculates an expense's payment status from its linked payments.
 */
export async function recalculateExpensePaymentState(expenseId: string): Promise<void> {
  const payments = await prisma.payment.findMany({
    where: { expenseId },
    select: { amount: true },
  });

  const hasPaid = payments.length > 0;
  await prisma.expenseTransaction.update({
    where: { id: expenseId },
    data: { status: hasPaid ? 'PAID' : 'UNPAID' },
  });
}

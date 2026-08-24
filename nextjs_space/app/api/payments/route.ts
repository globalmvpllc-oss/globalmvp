export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { paymentSchema, validateBody } from '@/lib/validation';
import {
  recalculateInvoicePaymentState,
  recalculateExpensePaymentState,
  computePaymentSummary,
  type TxClient,
} from '@/lib/payment-calc';
import { handleApiError } from '@/lib/api-error';
import Decimal from 'decimal.js';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(Number(searchParams.get('take') ?? 100), 1), 200);
    const skip = Math.max(Number(searchParams.get('skip') ?? 0), 0);

    const payments = await prisma.payment.findMany({
      where: { companyId },
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        expense: { select: { description: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take,
      skip,
    });
    return NextResponse.json(payments);
  } catch (error) {
    return handleApiError('payments:GET', error, { fallbackMessage: 'Failed' });
  }
}

/**
 * Creates a payment.
 *
 * The whole read-check-write sequence runs inside a Serializable transaction.
 * Previously the invoice was read, the remaining balance computed, and the
 * payment created as three independent statements — so two concurrent requests
 * could each see the same remaining balance and both succeed, overpaying the
 * invoice. Serializable isolation makes PostgreSQL abort the loser of that race,
 * which surfaces to the client as a 409 telling them to retry.
 */
export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error: validationError } = validateBody(paymentSchema, body);
    if (validationError) return NextResponse.json(validationError, { status: 400 });

    // Zod guarantees exactly one of invoiceId / expenseId is present.
    const paymentAmount = new Decimal(data.amount);

    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        if (data.invoiceId) {
          const invoice = await tx.invoice.findFirst({
            where: { id: data.invoiceId, companyId },
            select: { id: true, total: true, status: true, currency: true },
          });
          if (!invoice) {
            return { kind: 'error' as const, status: 404, message: 'Invoice not found or not owned by your company' };
          }

          if (invoice.status === 'CANCELLED' || invoice.status === 'PAID') {
            return {
              kind: 'error' as const,
              status: 409,
              message: `Cannot add payment to ${invoice.status.toLowerCase()} invoice`,
            };
          }

          // Payment currency must match the invoice currency. Without this a
          // 1000 TRY invoice could be settled with a 1000 USD payment at 1:1.
          if (data.currency !== invoice.currency) {
            return {
              kind: 'error' as const,
              status: 400,
              message: `Payment currency (${data.currency}) must match invoice currency (${invoice.currency})`,
            };
          }

          // Recompute paid-to-date from actual payment rows inside the transaction,
          // rather than trusting the denormalised amountPaid column.
          const existingPayments = await tx.payment.findMany({
            where: { invoiceId: invoice.id },
            select: { amount: true },
          });
          const { remaining } = computePaymentSummary(invoice.total, existingPayments);

          if (paymentAmount.gt(remaining)) {
            return {
              kind: 'error' as const,
              status: 400,
              message: `Payment amount exceeds remaining balance. Maximum: ${remaining.toFixed(2)}`,
            };
          }

          const payment = await tx.payment.create({
            data: {
              companyId,
              invoiceId: invoice.id,
              expenseId: null,
              amount: data.amount,
              currency: data.currency,
              paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
              paymentMethod: data.paymentMethod,
              reference: data.reference,
              notes: data.notes,
            },
          });

          await recalculateInvoicePaymentState(invoice.id, tx);
          return { kind: 'ok' as const, payment };
        }

        // --- Expense payment ---
        const expense = await tx.expenseTransaction.findFirst({
          where: { id: data.expenseId, companyId },
          select: { id: true, amount: true, currency: true },
        });
        if (!expense) {
          return { kind: 'error' as const, status: 404, message: 'Expense not found or not owned by your company' };
        }

        if (data.currency !== expense.currency) {
          return {
            kind: 'error' as const,
            status: 400,
            message: `Payment currency (${data.currency}) must match expense currency (${expense.currency})`,
          };
        }

        const existingExpensePayments = await tx.payment.findMany({
          where: { expenseId: expense.id },
          select: { amount: true },
        });
        const { remaining } = computePaymentSummary(expense.amount, existingExpensePayments);

        if (remaining.lte(0)) {
          return { kind: 'error' as const, status: 409, message: 'Expense is already fully paid' };
        }
        if (paymentAmount.gt(remaining)) {
          return {
            kind: 'error' as const,
            status: 400,
            message: `Payment amount exceeds remaining balance. Maximum: ${remaining.toFixed(2)}`,
          };
        }

        const payment = await tx.payment.create({
          data: {
            companyId,
            invoiceId: null,
            expenseId: expense.id,
            amount: data.amount,
            currency: data.currency,
            paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
            paymentMethod: data.paymentMethod,
            reference: data.reference,
            notes: data.notes,
          },
        });

        await recalculateExpensePaymentState(expense.id, tx);
        return { kind: 'ok' as const, payment };
      },
      { isolationLevel: 'Serializable' }
    );

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json(result.payment);
  } catch (error) {
    return handleApiError('payments:POST', error, { fallbackMessage: 'Failed' });
  }
}

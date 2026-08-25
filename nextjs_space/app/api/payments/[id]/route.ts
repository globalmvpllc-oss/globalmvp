export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { paymentUpdateSchema, validateBody } from '@/lib/validation';
import {
  recalculateInvoicePaymentState,
  recalculateExpensePaymentState,
  type TxClient,
} from '@/lib/payment-calc';
import { isOverpaymentForEdit, remainingForEdit } from '@/lib/payment-edit';
import { handleApiError } from '@/lib/api-error';
import Decimal from 'decimal.js';

/**
 * Editing and deleting a payment.
 *
 * A mistyped payment previously could not be corrected: it permanently marked
 * an invoice PAID with no way back. Both operations here reuse the existing
 * financial machinery rather than reimplementing it —
 * `recalculateInvoicePaymentState` and `recalculateExpensePaymentState` remain
 * the single source of truth for `amountPaid` and invoice status, so a payment
 * that is changed or removed drives the invoice back through
 * PAID -> PARTIALLY_PAID -> SENT exactly as the create path drives it forward.
 *
 * Everything runs inside one Serializable transaction, matching POST: the
 * read of sibling payments, the overpayment check and the write must not
 * interleave with a concurrent payment on the same invoice.
 *
 * The payment's target (invoiceId / expenseId) is deliberately immutable. Moving
 * a payment between invoices would have to recalculate both sides and has no
 * user-facing need; correcting a mis-linked payment means deleting it and
 * recording it again, which leaves a cleaner trail.
 */

/** Loads a payment that belongs to the caller's company, or null. */
async function findOwnedPayment(tx: TxClient, id: string, companyId: string) {
  return tx.payment.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      invoiceId: true,
      expenseId: true,
      amount: true,
      currency: true,
    },
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(paymentUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        // Scoped by companyId, so another company's payment is indistinguishable
        // from one that does not exist.
        const existing = await findOwnedPayment(tx, params.id, companyId);
        if (!existing) {
          return { kind: 'error' as const, status: 404, message: 'Payment not found' };
        }

        const nextAmount =
          data.amount === undefined ? new Decimal(existing.amount.toString()) : new Decimal(data.amount);

        if (existing.invoiceId) {
          const invoice = await tx.invoice.findFirst({
            where: { id: existing.invoiceId, companyId },
            select: { id: true, total: true, currency: true, status: true },
          });
          if (!invoice) {
            return { kind: 'error' as const, status: 404, message: 'Payment not found' };
          }

          if (invoice.status === 'CANCELLED') {
            return {
              kind: 'error' as const,
              status: 409,
              message: 'Cannot change a payment on a cancelled invoice',
            };
          }

          // Same rule as creation: a payment must be in the invoice's currency,
          // or a 1000 TRY invoice could be settled with 1000 USD at 1:1.
          const nextCurrency = data.currency ?? existing.currency;
          if (nextCurrency !== invoice.currency) {
            return {
              kind: 'error' as const,
              status: 400,
              message: `Payment currency (${nextCurrency}) must match invoice currency (${invoice.currency})`,
            };
          }

          const siblings = await tx.payment.findMany({
            where: { invoiceId: invoice.id },
            select: { id: true, amount: true },
          });

          // Excludes this payment, so raising 100 to 120 on a 120 invoice is
          // allowed rather than being counted against itself.
          if (isOverpaymentForEdit(nextAmount, invoice.total, siblings, existing.id)) {
            const max = remainingForEdit(invoice.total, siblings, existing.id);
            return {
              kind: 'error' as const,
              status: 400,
              message: `Payment amount exceeds remaining balance. Maximum: ${max.toFixed(2)}`,
            };
          }

          const payment = await tx.payment.update({
            where: { id: existing.id },
            data: {
              amount: nextAmount.toNumber(),
              currency: nextCurrency,
              paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
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
          where: { id: existing.expenseId ?? '', companyId },
          select: { id: true, amount: true, currency: true },
        });
        if (!expense) {
          return { kind: 'error' as const, status: 404, message: 'Payment not found' };
        }

        const nextCurrency = data.currency ?? existing.currency;
        if (nextCurrency !== expense.currency) {
          return {
            kind: 'error' as const,
            status: 400,
            message: `Payment currency (${nextCurrency}) must match expense currency (${expense.currency})`,
          };
        }

        const siblings = await tx.payment.findMany({
          where: { expenseId: expense.id },
          select: { id: true, amount: true },
        });

        if (isOverpaymentForEdit(nextAmount, expense.amount, siblings, existing.id)) {
          const max = remainingForEdit(expense.amount, siblings, existing.id);
          return {
            kind: 'error' as const,
            status: 400,
            message: `Payment amount exceeds remaining balance. Maximum: ${max.toFixed(2)}`,
          };
        }

        const payment = await tx.payment.update({
          where: { id: existing.id },
          data: {
            amount: nextAmount.toNumber(),
            currency: nextCurrency,
            paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
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
    return handleApiError('payments:PUT', error, {
      fallbackMessage: 'This payment could not be updated. Please try again.',
    });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        const existing = await findOwnedPayment(tx, params.id, companyId);
        if (!existing) {
          return { kind: 'error' as const, status: 404, message: 'Payment not found' };
        }

        // Scoped to companyId on the write as well, so a row that changed hands
        // between the check and the delete still cannot be removed.
        const deleted = await tx.payment.deleteMany({ where: { id: params.id, companyId } });
        if (deleted.count === 0) {
          return { kind: 'error' as const, status: 404, message: 'Payment not found' };
        }

        // Removing money paid has to walk the invoice back down: PAID becomes
        // PARTIALLY_PAID or SENT depending on what is left.
        if (existing.invoiceId) {
          await recalculateInvoicePaymentState(existing.invoiceId, tx);
        } else if (existing.expenseId) {
          await recalculateExpensePaymentState(existing.expenseId, tx);
        }

        return { kind: 'ok' as const };
      },
      { isolationLevel: 'Serializable' }
    );

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('payments:DELETE', error, {
      fallbackMessage: 'This payment could not be deleted. Please try again.',
    });
  }
}

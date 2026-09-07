export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { chequeTransitionSchema, validateBody } from '@/lib/validation';
import { parseCalendarDate } from '@/lib/calendar-date';
import { canTransition, isSettling } from '@/lib/cheque-status';
import { recalculateInvoicePaymentState, recalculateExpensePaymentState, type TxClient } from '@/lib/payment-calc';
import { computePaymentSummary } from '@/lib/payment-math';

/**
 * Moving a cheque or note to its next state.
 *
 * This endpoint exists rather than a `status` field on the update route because
 * a transition is not an edit: it is checked against the lifecycle, and two of
 * the seven states mean money moved.
 *
 * ## Where money enters the product
 *
 * An instrument holds no money. In PORTFOLIO, PRESENTED or OUTSTANDING it is a
 * promise: nothing it touches has changed, and the invoice it relates to is
 * exactly as outstanding as it was.
 *
 * Reaching CLEARED (received) or PAID (issued) is the moment money moved, and
 * the only thing this route does about it is **create a Payment** — through the
 * same `recalculateInvoicePaymentState` that every other payment path uses.
 * Nothing here writes a status onto an invoice; that hole was closed in
 * `fix(invoices): stop an invoice being marked paid without a payment` and it
 * stays closed. Every figure in the product goes on being derived from Payment
 * rows alone, so a cleared cheque moves exactly the totals a manually recorded
 * payment of the same amount would move, and nothing else.
 *
 * An instrument with no invoice or expense behind it — a cheque taken on
 * account — creates no Payment when it clears. There is nothing for a Payment
 * to attach to (`Payment` requires exactly one of invoiceId/expenseId), and
 * inventing an unlinked money row would put an amount into totals with nothing
 * explaining it. The instrument still moves to CLEARED, which is the truth: it
 * cleared, and the business has the cash, but the product has no document to
 * post it against. Recording the income separately is the existing answer.
 *
 * ## Concurrency
 *
 * Serializable, like the payment routes and for the same reason: the status is
 * read and then written, and the settling branch creates money on the strength
 * of that read. Two concurrent "mark cleared" requests must not both see
 * PRESENTED and both create a Payment. The loser aborts and surfaces as a 409.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(chequeTransitionSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultPaymentMethod: true },
    });

    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        const cheque = await tx.chequeInstrument.findFirst({
          where: { id: params.id, companyId },
          select: {
            id: true,
            direction: true,
            status: true,
            amount: true,
            currency: true,
            invoiceId: true,
            expenseId: true,
            paymentId: true,
          },
        });
        if (!cheque) {
          return { kind: 'error' as const, status: 404, message: 'Not found' };
        }

        if (!canTransition(cheque.direction, cheque.status, data.status)) {
          return {
            kind: 'error' as const,
            status: 409,
            message: `Cannot change from ${cheque.status} to ${data.status}`,
          };
        }

        const settles = isSettling(data.status);
        const now = new Date();

        let paymentId: string | null = cheque.paymentId;

        if (settles && !cheque.paymentId) {
          paymentId = await settle(tx, {
            companyId,
            cheque,
            paymentDate: parseCalendarDate(data.paymentDate) ?? parseCalendarDate(now)!,
            paymentMethod: data.paymentMethod ?? company?.defaultPaymentMethod ?? 'bank_transfer',
          });
        }

        await tx.chequeInstrument.update({
          where: { id: cheque.id },
          data: {
            status: data.status,
            presentedAt: data.status === 'PRESENTED' ? now : undefined,
            settledAt: settles || data.status === 'BOUNCED' ? now : undefined,
            paymentId,
          },
        });

        return { kind: 'ok' as const };
      },
      { isolationLevel: 'Serializable' }
    );

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    const cheque = await prisma.chequeInstrument.findFirst({
      where: { id: params.id, companyId },
      include: {
        customer: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        expense: { select: { id: true, description: true } },
        payment: { select: { id: true, amount: true, paymentDate: true } },
      },
    });
    return NextResponse.json(cheque);
  } catch (error) {
    return handleApiError('cheques:PATCH:status', error, {
      fallbackMessage: 'The instrument could not be updated',
    });
  }
}

/**
 * Creates the Payment a settling instrument produces, and returns its id.
 *
 * Returns null when there is nothing to attach it to. The amount is capped at
 * what the document still owes: an instrument covering more than the remaining
 * balance would otherwise overpay it, which the payments API refuses for a
 * reason and this route must not do behind its back.
 */
async function settle(
  tx: TxClient,
  input: {
    companyId: string;
    cheque: {
      id: string;
      amount: unknown;
      currency: string;
      invoiceId: string | null;
      expenseId: string | null;
    };
    paymentDate: Date;
    paymentMethod: string;
  }
): Promise<string | null> {
  const { cheque } = input;
  const face = new Decimal(String(cheque.amount));

  if (cheque.invoiceId) {
    const invoice = await tx.invoice.findFirst({
      where: { id: cheque.invoiceId, companyId: input.companyId },
      select: { id: true, total: true, currency: true },
    });
    // A currency mismatch is not a weak match, it is not a settlement: the
    // payments API refuses one and so does this. The instrument still clears —
    // it did — but it posts no money against a document it cannot settle.
    if (!invoice || invoice.currency !== cheque.currency) return null;

    const existing = await tx.payment.findMany({
      where: { invoiceId: invoice.id },
      select: { amount: true },
    });
    const { remaining } = computePaymentSummary(invoice.total, existing);
    const amount = Decimal.min(face, remaining);
    if (amount.lte(0)) return null;

    const payment = await tx.payment.create({
      data: {
        companyId: input.companyId,
        invoiceId: invoice.id,
        expenseId: null,
        amount: amount.toNumber(),
        currency: invoice.currency,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        reference: null,
        notes: null,
      },
    });
    // Derives the invoice's status from its payments, exactly as every other
    // payment path does. This route never writes a status onto an invoice.
    await recalculateInvoicePaymentState(invoice.id, tx);
    return payment.id;
  }

  if (cheque.expenseId) {
    const expense = await tx.expenseTransaction.findFirst({
      where: { id: cheque.expenseId, companyId: input.companyId },
      select: { id: true, amount: true, currency: true },
    });
    if (!expense || expense.currency !== cheque.currency) return null;

    const existing = await tx.payment.findMany({
      where: { expenseId: expense.id },
      select: { amount: true },
    });
    const { remaining } = computePaymentSummary(expense.amount, existing);
    const amount = Decimal.min(face, remaining);
    if (amount.lte(0)) return null;

    const payment = await tx.payment.create({
      data: {
        companyId: input.companyId,
        invoiceId: null,
        expenseId: expense.id,
        amount: amount.toNumber(),
        currency: expense.currency,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        reference: null,
        notes: null,
      },
    });
    await recalculateExpensePaymentState(expense.id, tx);
    return payment.id;
  }

  // Taken on account: nothing to post it against.
  return null;
}

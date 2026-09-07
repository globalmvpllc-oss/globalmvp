export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { isChequeDirection } from '@/lib/cheque-status';
import { OPEN_INVOICE_STATUSES } from '@/lib/invoice-status';

/**
 * The documents a cheque could settle.
 *
 * A dedicated endpoint rather than widening `/api/invoices`, for two reasons:
 * the picker needs a filter that list does not have (this customer, this
 * currency, still owing something), and every other consumer of that list would
 * have to be considered before changing it.
 *
 * ## What is offered, and why it is narrow
 *
 * **Currency.** Only documents in the cheque's own currency. The settling path
 * refuses a mismatch — a TRY cheque cannot settle a EUR invoice — so offering
 * one would let a user pick a document that silently receives no money when the
 * cheque clears. Filtering here is the difference between a rule the user meets
 * at the point of choosing and one they discover weeks later.
 *
 * **Still owing.** `OPEN_INVOICE_STATUSES` for the received side: a draft has
 * not been issued to anybody and a settled invoice has nothing left to pay.
 * UNPAID expenses for the issued side, for the same reason.
 *
 * **This company.** Scoped by the session's companyId like everything else, so
 * the picker can only ever show documents the caller owns — which is also what
 * makes the link check on write a second line of defence rather than the only
 * one.
 *
 * ## Ceiling
 *
 * A picker is not a report. `MAX_OPTIONS` bounds the read; a business with more
 * open invoices than that types the number into the search box on the invoices
 * screen instead. It is never used to compute a total, so truncating it cannot
 * make a figure wrong.
 */
const MAX_OPTIONS = 200;

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');
    const currency = searchParams.get('currency');
    const customerId = searchParams.get('customerId');
    const vendorId = searchParams.get('vendorId');

    if (!isChequeDirection(direction)) {
      return NextResponse.json({ error: 'A direction is required' }, { status: 400 });
    }

    if (direction === 'RECEIVED') {
      const invoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: [...OPEN_INVOICE_STATUSES] },
          ...(currency ? { currency } : {}),
          ...(customerId ? { customerId } : {}),
        },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          currency: true,
          total: true,
          amountPaid: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: MAX_OPTIONS,
      });

      return NextResponse.json(
        invoices
          .map((invoice) => {
            const outstanding = new Decimal(String(invoice.total)).minus(
              new Decimal(String(invoice.amountPaid))
            );
            return {
              id: invoice.id,
              label: invoice.invoiceNumber,
              party: invoice.customer?.name ?? null,
              date: invoice.dueDate,
              currency: invoice.currency,
              total: new Decimal(String(invoice.total)).toFixed(2),
              outstanding: outstanding.toFixed(2),
            };
          })
          // An invoice whose payments already cover it has nothing left for a
          // cheque to settle, whatever its status says.
          .filter((row) => Number(row.outstanding) > 0)
      );
    }

    const expenses = await prisma.expenseTransaction.findMany({
      where: {
        companyId,
        status: 'UNPAID',
        ...(currency ? { currency } : {}),
        ...(vendorId ? { vendorId } : {}),
      },
      select: {
        id: true,
        description: true,
        date: true,
        dueDate: true,
        currency: true,
        amount: true,
        vendor: { select: { id: true, name: true } },
        // ExpenseTransaction has no amountPaid column, so what is still owed is
        // computed from the payment rows — the same source the settling path
        // uses, so the two cannot disagree.
        payments: { select: { amount: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }, { id: 'asc' }],
      take: MAX_OPTIONS,
    });

    return NextResponse.json(
      expenses
        .map((expense) => {
          const total = new Decimal(String(expense.amount));
          const paid = expense.payments.reduce(
            (sum, payment) => sum.plus(new Decimal(String(payment.amount))),
            new Decimal(0)
          );
          return {
            id: expense.id,
            label: expense.description,
            party: expense.vendor?.name ?? null,
            date: expense.dueDate ?? expense.date,
            currency: expense.currency,
            total: total.toFixed(2),
            outstanding: Decimal.max(total.minus(paid), new Decimal(0)).toFixed(2),
          };
        })
        .filter((row) => Number(row.outstanding) > 0)
    );
  } catch (error) {
    return handleApiError('cheques:GET:linkable', error, {
      fallbackMessage: 'Failed to load the documents this could settle',
    });
  }
}

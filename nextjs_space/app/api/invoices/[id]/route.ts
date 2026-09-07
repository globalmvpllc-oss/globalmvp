export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { invoiceUpdateSchema, validateBody } from '@/lib/validation';
import { calculateInvoice, d2n } from '@/lib/invoice-calc';
import { canTransition, isValidStatus, isMoneyDerivedStatus } from '@/lib/invoice-status';
import { recalculateInvoicePaymentState, type TxClient } from '@/lib/payment-calc';
import { computePaymentSummary } from '@/lib/payment-math';
import Decimal from 'decimal.js';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';

const DUPLICATE_NUMBER_MESSAGE = 'An invoice with this number already exists';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId },
      include: { items: true, customer: true, payments: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError('invoices:GET:id', error, { fallbackMessage: 'Failed' });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const existing = await prisma.invoice.findFirst({ where: { id: params.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { data, error: validationError } = validateBody(invoiceUpdateSchema, body);
    if (validationError) return NextResponse.json(validationError, { status: 400 });

    // ---- Status-only update: validate the state transition ----
    if (data.status && !data.items) {
      if (!isValidStatus(data.status)) {
        return NextResponse.json({ error: `Invalid status: ${data.status}` }, { status: 400 });
      }
      if (!canTransition(existing.status, data.status)) {
        return NextResponse.json(
          { error: `Cannot change from ${existing.status} to ${data.status}` },
          { status: 409 }
        );
      }

      /**
       * Marking an invoice paid records the payment that makes it true.
       *
       * This used to write `{ status: 'PAID' }` and nothing else, so the
       * invoice read as settled while `amountPaid` stayed at zero and every
       * other surface went on counting the full amount as owed.
       *
       * The action is kept — people use it, and taking it away to force them
       * through the payment dialog would read as a regression — but it now
       * creates the settling payment in the same transaction. The status is
       * then *derived* from the payment rows by
       * `recalculateInvoicePaymentState`, exactly as it is when a payment is
       * recorded by hand, rather than being written here. So the invariant
       * holds by construction: nothing in this route can produce a PAID invoice
       * that is not covered.
       *
       * Serializable, like the payment route, and for the same reason: the
       * amount outstanding is read and then written, so two concurrent requests
       * must not both see the same balance and both settle it. The loser aborts
       * and surfaces as a 409 telling the caller to retry.
       */
      if (data.status === 'PAID') {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { defaultPaymentMethod: true },
        });

        const settled = await prisma.$transaction(
          async (tx: TxClient) => {
            // Re-read inside the transaction: the status may have moved since
            // the check above, and the balance certainly may have.
            const invoice = await tx.invoice.findFirst({
              where: { id: params.id, companyId },
              select: { id: true, total: true, status: true, currency: true },
            });
            if (!invoice) {
              return { kind: 'error' as const, status: 404, message: 'Not found' };
            }
            if (invoice.status === 'PAID') {
              // Already settled by a payment that landed in between. Nothing to
              // record, and nothing to complain about.
              return { kind: 'noop' as const };
            }
            if (!canTransition(invoice.status, 'PAID')) {
              return {
                kind: 'error' as const,
                status: 409,
                message: `Cannot change from ${invoice.status} to PAID`,
              };
            }

            const totalDec = new Decimal(String(invoice.total));

            /**
             * A zero-total invoice has nothing to collect.
             *
             * The invariant is `amountPaid >= total`, which 0 >= 0 satisfies,
             * so this may close with no payment. It has to be handled here
             * because `deriveStatusFromPayments` requires `total > 0` before it
             * will return PAID — without this the button would silently do
             * nothing.
             */
            if (totalDec.lte(0)) {
              await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });
              return { kind: 'ok' as const, amount: '0.00' };
            }

            // Computed from the payment rows, never from the denormalised
            // amountPaid column, so a partial payment already recorded is
            // subtracted and cannot be counted twice.
            const existingPayments = await tx.payment.findMany({
              where: { invoiceId: invoice.id },
              select: { amount: true },
            });
            const { remaining } = computePaymentSummary(invoice.total, existingPayments);

            if (remaining.gt(0)) {
              await tx.payment.create({
                data: {
                  companyId,
                  invoiceId: invoice.id,
                  expenseId: null,
                  amount: remaining.toNumber(),
                  // The invoice's currency, never the caller's: a settling
                  // payment cannot be denominated in anything else.
                  currency: invoice.currency,
                  paymentDate:
                    parseCalendarDate(data.paymentDate) ?? parseCalendarDate(new Date())!,
                  paymentMethod:
                    data.paymentMethod ?? company?.defaultPaymentMethod ?? 'bank_transfer',
                  reference: data.paymentReference ?? null,
                  notes: null,
                },
              });
            }

            // Derives the status from what the payment rows now say. This is
            // what makes "mark paid" incapable of lying.
            await recalculateInvoicePaymentState(invoice.id, tx);
            return { kind: 'ok' as const, amount: remaining.toFixed(2) };
          },
          { isolationLevel: 'Serializable' }
        );

        if (settled.kind === 'error') {
          return NextResponse.json({ error: settled.message }, { status: settled.status });
        }

        const invoice = await prisma.invoice.findFirst({
          where: { id: params.id, companyId },
          include: { items: true, customer: true },
        });
        return NextResponse.json(invoice);
      }

      /**
       * Every other money-derived status is refused as a bare assertion.
       *
       * That leaves PARTIALLY_PAID: it says money arrived without saying how
       * much, which no other surface can act on — the amount is exactly what
       * the customer card, the statement and the reports need. Recording the
       * payment produces this status on its own, which is the only way it has
       * ever been true. PAID is not caught here because it was granted above,
       * by earning it rather than by being told.
       */
      if (isMoneyDerivedStatus(data.status)) {
        return NextResponse.json(
          {
            error:
              'An invoice becomes partially paid by recording a payment against it, not by setting the status. Record the payment instead.',
          },
          { status: 409 }
        );
      }

      const invoice = await prisma.invoice.update({
        where: { id: params.id },
        data: { status: data.status },
        include: { items: true, customer: true },
      });
      return NextResponse.json(invoice);
    }

    // ---- Full update including line items ----
    if (data.items) {
      // Financial-integrity guard: editing line items rewrites subtotal/tax/total.
      // Allowing that on an issued invoice can push `total` below `amountPaid`,
      // producing an invoice that is simultaneously PAID and over-paid. Line-item
      // edits are therefore restricted to DRAFT invoices; issued invoices must be
      // cancelled and reissued (or corrected with a credit note).
      if (existing.status !== 'DRAFT') {
        return NextResponse.json(
          {
            error: `Line items can only be edited while an invoice is in DRAFT (current status: ${existing.status}). Cancel and reissue the invoice instead.`,
          },
          { status: 409 }
        );
      }

      if (data.customerId) {
        const customer = await prisma.customer.findFirst({
          where: { id: data.customerId, companyId },
        });
        if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      const { totals, errors: calcErrors } = calculateInvoice(data.items);
      if (calcErrors.length > 0) {
        return NextResponse.json({ error: 'Validation failed', details: calcErrors }, { status: 400 });
      }

      // deleteMany + update must be atomic. Previously these were two separate
      // statements: if the update failed, the invoice was left with zero line
      // items but its old totals intact.
      const invoice = await prisma.$transaction(async (tx: TxClient) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: params.id } });

        const updated = await tx.invoice.update({
          where: { id: params.id },
          data: {
            customerId: data.customerId ?? existing.customerId,
            invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
            issueDate: parseCalendarDate(data.issueDate) ?? existing.issueDate,
            dueDate: parseCalendarDate(data.dueDate) ?? existing.dueDate,
            currency: data.currency ?? existing.currency,
            subtotal: d2n(totals.subtotal),
            taxTotal: d2n(totals.taxTotal),
            discountTotal: d2n(totals.discountTotal),
            total: d2n(totals.total),
            notes: data.notes ?? existing.notes,
            items: {
              create: totals.items.map((item) => ({
                description: item.description,
                quantity: d2n(item.quantity),
                unitPrice: d2n(item.unitPrice),
                discount: d2n(item.discount),
                taxRate: d2n(item.taxRate),
                taxLabel: item.taxLabel,
                amount: d2n(item.amount),
              })),
            },
          },
          include: { items: true, customer: true },
        });

        // Totals changed, so re-derive amountPaid/status from actual payments.
        await recalculateInvoicePaymentState(params.id, tx);
        return updated;
      });

      return NextResponse.json(invoice);
    }

    // ---- Partial update (no items, no status) ----
    const updateData: Record<string, unknown> = {};
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: data.customerId, companyId },
      });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      updateData.customerId = data.customerId;
    }
    if (data.invoiceNumber) updateData.invoiceNumber = data.invoiceNumber;
    if (data.issueDate) updateData.issueDate = parseCalendarDate(data.issueDate);
    if (data.dueDate) updateData.dueDate = parseCalendarDate(data.dueDate);
    if (data.currency) updateData.currency = data.currency;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
      include: { items: true, customer: true },
    });
    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError('invoices:PUT', error, {
      conflictMessage: DUPLICATE_NUMBER_MESSAGE,
      fallbackMessage: 'Failed to update',
    });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, _count: { select: { payments: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Payment.invoiceId is ON DELETE SET NULL, so deleting an invoice that has
    // payments silently orphans them — they stop counting toward revenue and
    // can no longer be reconciled. Block it instead.
    if (existing._count.payments > 0) {
      return NextResponse.json(
        {
          error: 'Invoice has payments and cannot be deleted. Delete the payments first, or cancel the invoice.',
        },
        { status: 409 }
      );
    }

    const deleted = await prisma.invoice.deleteMany({ where: { id: params.id, companyId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('invoices:DELETE', error, { fallbackMessage: 'Failed' });
  }
}

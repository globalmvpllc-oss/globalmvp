export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { invoiceUpdateSchema, validateBody } from '@/lib/validation';
import { calculateInvoice, d2n } from '@/lib/invoice-calc';
import { canTransition, isValidStatus } from '@/lib/invoice-status';
import { recalculateInvoicePaymentState, type TxClient } from '@/lib/payment-calc';
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

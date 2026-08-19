export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { invoiceUpdateSchema, validateBody } from '@/lib/validation';
import { calculateInvoice, d2n } from '@/lib/invoice-calc';
import { canTransition, isValidStatus } from '@/lib/invoice-status';

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
  } catch (error: any) {
    console.error('Invoice fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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

    // Status-only update: validate state transition
    if (data.status && !data.items) {
      if (!isValidStatus(data.status)) {
        return NextResponse.json({ error: `Invalid status: ${data.status}` }, { status: 400 });
      }
      if (!canTransition(existing.status, data.status)) {
        return NextResponse.json({ error: `Cannot change from ${existing.status} to ${data.status}` }, { status: 400 });
      }
      const invoice = await prisma.invoice.update({
        where: { id: params.id },
        data: { status: data.status },
        include: { items: true, customer: true },
      });
      return NextResponse.json(invoice);
    }

    // Full update with items
    if (data.items) {
      if (data.customerId) {
        const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      const { totals, errors: calcErrors } = calculateInvoice(data.items);
      if (calcErrors.length > 0) return NextResponse.json({ error: 'Validation failed', details: calcErrors }, { status: 400 });

      await prisma.invoiceItem.deleteMany({ where: { invoiceId: params.id } });

      const invoice = await prisma.invoice.update({
        where: { id: params.id },
        data: {
          customerId: data.customerId ?? existing.customerId,
          invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
          issueDate: data.issueDate ? new Date(data.issueDate) : existing.issueDate,
          dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
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
      return NextResponse.json(invoice);
    }

    // Partial update (no items, no status)
    const updateData: any = {};
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId } });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      updateData.customerId = data.customerId;
    }
    if (data.invoiceNumber) updateData.invoiceNumber = data.invoiceNumber;
    if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.currency) updateData.currency = data.currency;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
      include: { items: true, customer: true },
    });
    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error('Invoice update error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.invoice.findFirst({ where: { id: params.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.invoice.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Invoice delete error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

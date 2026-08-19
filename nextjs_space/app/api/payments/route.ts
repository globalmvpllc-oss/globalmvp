export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { paymentSchema, validateBody } from '@/lib/validation';
import { recalculateInvoicePaymentState, recalculateExpensePaymentState } from '@/lib/payment-calc';
import Decimal from 'decimal.js';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const payments = await prisma.payment.findMany({
      where: { companyId },
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        expense: { select: { description: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });
    return NextResponse.json(payments);
  } catch (error: any) {
    console.error('Payments fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error: validationError } = validateBody(paymentSchema, body);
    if (validationError) return NextResponse.json(validationError, { status: 400 });

    // Verify ownership of linked invoice
    if (data.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, companyId },
      });
      if (!invoice) return NextResponse.json({ error: 'Invoice not found or not owned by your company' }, { status: 404 });

      // Prevent overpayment
      const remaining = new Decimal(invoice.total.toString()).minus(new Decimal(invoice.amountPaid.toString()));
      const paymentAmount = new Decimal(data.amount);
      if (paymentAmount.gt(remaining)) {
        return NextResponse.json({
          error: `Payment amount exceeds remaining balance. Maximum: ${remaining.toFixed(2)}`,
        }, { status: 400 });
      }

      // Prevent payments on cancelled invoices
      if (invoice.status === 'CANCELLED' || invoice.status === 'PAID') {
        return NextResponse.json({ error: `Cannot add payment to ${invoice.status.toLowerCase()} invoice` }, { status: 400 });
      }
    }

    // Verify ownership of linked expense
    if (data.expenseId) {
      const expense = await prisma.expenseTransaction.findFirst({
        where: { id: data.expenseId, companyId },
      });
      if (!expense) return NextResponse.json({ error: 'Expense not found or not owned by your company' }, { status: 404 });
    }

    const payment = await prisma.payment.create({
      data: {
        companyId,
        invoiceId: data.invoiceId || null,
        expenseId: data.expenseId || null,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        paymentMethod: data.paymentMethod ?? 'bank_transfer',
        reference: data.reference,
        notes: data.notes,
      },
    });

    // Recalculate linked states from actual payment sums
    if (data.invoiceId) {
      await recalculateInvoicePaymentState(data.invoiceId);
    }
    if (data.expenseId) {
      await recalculateExpensePaymentState(data.expenseId);
    }

    return NextResponse.json(payment);
  } catch (error: any) {
    console.error('Payment create error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { invoiceCreateSchema, validateBody } from '@/lib/validation';
import { calculateInvoice, d2n } from '@/lib/invoice-calc';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const where: any = { companyId };
    if (status && status !== 'ALL') where.status = status;

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: { select: { name: true, companyName: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error('Invoices fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error: validationError } = validateBody(invoiceCreateSchema, body);
    if (validationError) return NextResponse.json(validationError, { status: 400 });

    // Verify customer belongs to this company
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, companyId },
    });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Calculate totals using Decimal engine
    const { totals, errors: calcErrors } = calculateInvoice(data.items);
    if (calcErrors.length > 0) return NextResponse.json({ error: 'Validation failed', details: calcErrors }, { status: 400 });

    // Generate invoice number with retry for race condition
    let invoiceNumber = data.invoiceNumber;
    if (!invoiceNumber) {
      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const count = await prisma.invoice.count({ where: { companyId } });
        invoiceNumber = `INV-${(count + 1 + attempt).toString().padStart(4, '0')}`;
        const existing = await prisma.invoice.findFirst({
          where: { companyId, invoiceNumber },
        });
        if (!existing) break;
        if (attempt === maxRetries - 1) {
          // Fallback: use timestamp-based number
          invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
        }
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId: data.customerId,
        invoiceNumber: invoiceNumber!,
        status: data.status ?? 'DRAFT',
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: new Date(data.dueDate),
        currency: data.currency ?? 'USD',
        subtotal: d2n(totals.subtotal),
        taxTotal: d2n(totals.taxTotal),
        discountTotal: d2n(totals.discountTotal),
        total: d2n(totals.total),
        notes: data.notes,
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
  } catch (error: any) {
    console.error('Invoice create error:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Duplicate invoice number. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}

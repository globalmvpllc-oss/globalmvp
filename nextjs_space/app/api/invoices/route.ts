export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { invoiceCreateSchema, validateBody } from '@/lib/validation';
import { calculateInvoice, d2n } from '@/lib/invoice-calc';
import { type TxClient } from '@/lib/payment-calc';
import { handleApiError } from '@/lib/api-error';
import { allocateInvoiceNumber } from '@/lib/invoice-number';

const DUPLICATE_NUMBER_MESSAGE = 'An invoice with this number already exists';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const take = Math.min(Math.max(Number(searchParams.get('take') ?? 100), 1), 200);
    const skip = Math.max(Number(searchParams.get('skip') ?? 0), 0);

    const where: Record<string, unknown> = { companyId };
    if (status && status !== 'ALL') where.status = status;

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true, companyName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
    return NextResponse.json(invoices);
  } catch (error) {
    return handleApiError('invoices:GET', error, { fallbackMessage: 'Failed' });
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
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Calculate totals using the Decimal engine
    const { totals, errors: calcErrors } = calculateInvoice(data.items);
    if (calcErrors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: calcErrors }, { status: 400 });
    }

    /**
     * Default isolation, deliberately not Serializable.
     *
     * allocateInvoiceNumber takes a row lock on the company row via an atomic
     * increment, and that alone serialises concurrent allocation for this
     * company: a second request blocks on the lock, then reads the
     * already-incremented value. Under Serializable, Postgres would abort one of
     * the two transactions with a write conflict instead, so a user creating an
     * invoice at the same moment as a colleague would get a 409 and have to
     * retry — for a case the database can simply queue.
     *
     * The lock lasts only as long as this transaction. If the insert fails the
     * increment rolls back with it, so a failed create burns no number.
     */
    const invoice = await prisma.$transaction(
      async (tx: TxClient) => {
        const invoiceNumber = data.invoiceNumber ?? (await allocateInvoiceNumber(tx, companyId));

        return tx.invoice.create({
          data: {
            companyId,
            customerId: data.customerId,
            invoiceNumber,
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
      }
    );

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError('invoices:POST', error, {
      conflictMessage: DUPLICATE_NUMBER_MESSAGE,
      fallbackMessage: 'Failed to create invoice',
    });
  }
}

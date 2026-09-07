export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { customerSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { buildCustomerUpdateData } from '@/lib/customer-fields';
import Decimal from 'decimal.js';
import { isIssuedInvoice } from '@/lib/invoice-status';

interface CurrencyTotals {
  totalInvoiced: string;
  totalPaid: string;
  outstanding: string;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, companyId },
      include: {
        // Narrowed from `include: { payments: true }`. The UI renders only these
        // fields; pulling every payment row for every invoice made the response
        // grow without bound and exposed more than the page needs.
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            currency: true,
            total: true,
            amountPaid: true,
            issueDate: true,
            dueDate: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /**
     * Totals are grouped per currency. Summing a 1000 USD invoice with a
     * 1000 EUR invoice into "2000" is financially meaningless.
     *
     * Only issued invoices count. This used to sum every status, so a customer
     * with four unissued drafts was shown as owing $5,841 and €24,992 that they
     * had never been billed for — a draft is a document being written, not a
     * claim on anybody. The filter is `isIssuedInvoice`, the same definition the
     * statement below these cards and the dashboard's receivables both use, so
     * the three cannot drift apart again.
     *
     * `customer.invoices` deliberately keeps every status: the Invoice History
     * list underneath needs drafts, because finding and finishing one is the
     * whole point of having it. What changes here is the money, not the list.
     */
    const perCurrency = new Map<string, { invoiced: Decimal; paid: Decimal }>();
    for (const inv of customer.invoices ?? []) {
      if (!isIssuedInvoice(inv.status)) continue;
      const cur = inv.currency || 'USD';
      const bucket = perCurrency.get(cur) ?? { invoiced: new Decimal(0), paid: new Decimal(0) };
      bucket.invoiced = bucket.invoiced.plus(new Decimal(inv.total.toString()));
      bucket.paid = bucket.paid.plus(new Decimal(inv.amountPaid.toString()));
      perCurrency.set(cur, bucket);
    }

    const byCurrency: Record<string, CurrencyTotals> = {};
    for (const [cur, b] of perCurrency.entries()) {
      byCurrency[cur] = {
        totalInvoiced: b.invoiced.toFixed(2),
        totalPaid: b.paid.toFixed(2),
        outstanding: b.invoiced.minus(b.paid).toFixed(2),
      };
    }

    // Backwards-compatible flat fields for the existing detail page, which
    // renders them with the customer's default currency label. They now report
    // that one currency's bucket instead of a meaningless cross-currency sum.
    // Falls back to the only currency present when the default has no invoices.
    const preferred = customer.defaultCurrency || 'USD';
    const legacyKey = perCurrency.has(preferred)
      ? preferred
      : perCurrency.size === 1
        ? [...perCurrency.keys()][0]
        : preferred;
    const legacy = perCurrency.get(legacyKey);

    return NextResponse.json({
      ...customer,
      byCurrency,
      summaryCurrency: legacyKey,
      totalInvoiced: legacy ? legacy.invoiced.toNumber() : 0,
      totalPaid: legacy ? legacy.paid.toNumber() : 0,
      outstanding: legacy ? legacy.invoiced.minus(legacy.paid).toNumber() : 0,
    });
  } catch (error) {
    return handleApiError('customers:GET:id', error, { fallbackMessage: 'Failed' });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const existing = await prisma.customer.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { data, error } = validateBody(customerSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    // Scoped by companyId as well as id. The ownership check above already
    // ran, but keeping the scope on the write means a row that changed hands
    // between the two statements still cannot be updated.
    const updated = await prisma.customer.updateMany({
      where: { id: params.id, companyId },
      data: buildCustomerUpdateData(data),
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const customer = await prisma.customer.findFirst({ where: { id: params.id, companyId } });
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError('customers:PUT', error, {
      conflictMessage: 'Another customer already uses these details.',
      notFoundMessage: 'That customer no longer exists.',
      fallbackMessage: 'This customer could not be saved. Please try again.',
    });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.customer.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, _count: { select: { invoices: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Invoice.customerId is ON DELETE CASCADE, so deleting a customer would take
    // their entire invoice history (and its line items) with it — irreversible
    // destruction of financial records behind a single confirm dialog.
    if (existing._count.invoices > 0) {
      return NextResponse.json(
        {
          error: `Customer has ${existing._count.invoices} invoice(s) and cannot be deleted. Delete or reassign the invoices first.`,
        },
        { status: 409 }
      );
    }

    const deleted = await prisma.customer.deleteMany({ where: { id: params.id, companyId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('customers:DELETE', error, { fallbackMessage: 'Failed' });
  }
}

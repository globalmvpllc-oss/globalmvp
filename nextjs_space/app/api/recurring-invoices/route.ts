export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { recurringCreateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { applyCompanyTaxLabel, companyCurrency, computeLineItems } from '@/lib/line-items';

/** Recurring invoice templates of the session's company. */
export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const templates = await prisma.recurringInvoice.findMany({
      where: { companyId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { orderBy: { position: 'asc' } },
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return NextResponse.json(templates);
  } catch (error) {
    return handleApiError('recurring:GET', error, { fallbackMessage: 'Failed to load recurring invoices' });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const { data, error } = validateBody(recurringCreateSchema, await request.json());
    if (error) return NextResponse.json(error, { status: 400 });

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Currency and tax label come from the company's settings when not given.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true, defaultCurrency: true },
    });
    const { rows, errors } = computeLineItems(applyCompanyTaxLabel(data.items, company?.country));
    if (errors.length > 0) return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });

    const start = parseCalendarDate(data.startDate)!;
    const end = data.endDate ? parseCalendarDate(data.endDate) : null;
    if (end && end < start) {
      return NextResponse.json({ error: 'The end date cannot be before the start date', code: 'END_BEFORE_START' }, { status: 400 });
    }

    const template = await prisma.recurringInvoice.create({
      data: {
        companyId,
        customerId: data.customerId,
        name: data.name || null,
        frequency: data.frequency,
        dayOfMonth: start.getUTCDate(),
        nextRunDate: start,
        endDate: end,
        isActive: true,
        // Off unless the user explicitly turned it on.
        autoSend: data.autoSend === true,
        currency: companyCurrency(data.currency, company),
        paymentTermsDays: data.paymentTermsDays ?? 30,
        notes: data.notes,
        items: {
          create: rows.map((row, position) => ({
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            discount: row.discount,
            taxRate: row.taxRate,
            taxLabel: row.taxLabel,
            position,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return handleApiError('recurring:POST', error, { fallbackMessage: 'Failed to create recurring invoice' });
  }
}

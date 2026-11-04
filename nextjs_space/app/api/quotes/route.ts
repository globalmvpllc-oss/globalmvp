export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { quoteCreateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { allocateQuoteNumber } from '@/lib/quote-number';
import { applyCompanyTaxLabel, companyCurrency, computeLineItems } from '@/lib/line-items';
import { isQuoteStatus } from '@/lib/quote-status';
import type { TxClient } from '@/lib/invoice-number';

/** Quotes of the session's company, newest first. ?status= filters. */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const take = Math.min(Math.max(Number(searchParams.get('take') ?? 200) || 200, 1), 500);

    const quotes = await prisma.quote.findMany({
      where: { companyId, ...(isQuoteStatus(status) ? { status } : {}) },
      include: {
        customer: { select: { id: true, name: true, companyName: true } },
        convertedInvoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return NextResponse.json(quotes);
  } catch (error) {
    return handleApiError('quotes:GET', error, { fallbackMessage: 'Failed to load quotes' });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const { data, error } = validateBody(quoteCreateSchema, await request.json());
    if (error) return NextResponse.json(error, { status: 400 });

    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, companyId },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Currency and tax label come from the company's settings when not given.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true, defaultCurrency: true },
    });
    const { totals, rows, errors } = computeLineItems(applyCompanyTaxLabel(data.items, company?.country));
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    const issueDate = parseCalendarDate(data.issueDate) ?? parseCalendarDate(new Date())!;
    const validUntil = parseCalendarDate(data.validUntil)!;
    if (validUntil < issueDate) {
      return NextResponse.json(
        { error: 'The valid-until date cannot be before the quote date', code: 'VALID_UNTIL_BEFORE_ISSUE' },
        { status: 400 }
      );
    }

    const quote = await prisma.$transaction(async (tx: TxClient) => {
      const quoteNumber = await allocateQuoteNumber(tx, companyId);
      return tx.quote.create({
        data: {
          companyId,
          customerId: data.customerId,
          quoteNumber,
          status: 'DRAFT',
          issueDate,
          validUntil,
          currency: companyCurrency(data.currency, company),
          ...totals,
          notes: data.notes,
          items: { create: rows },
        },
        include: { items: true, customer: true },
      });
    });
    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    return handleApiError('quotes:POST', error, {
      conflictMessage: 'A quote with this number already exists',
      fallbackMessage: 'Failed to create quote',
    });
  }
}

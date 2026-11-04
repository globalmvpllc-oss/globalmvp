export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';
import { allocateInvoiceNumber, type TxClient } from '@/lib/invoice-number';
import { addCalendarDays, parseCalendarDate, todayCalendarInput } from '@/lib/calendar-date';
import { computeLineItems, itemsFromRows } from '@/lib/line-items';
import { canConvertQuote } from '@/lib/quote-status';

/**
 * Turns a quote into a DRAFT invoice in one click.
 *
 * - Line items are copied as they are (same description, quantity, price,
 *   discount and tax rate), so the totals come out identical.
 * - Exactly once: the quote is claimed inside the transaction by a write that
 *   only succeeds while `convertedInvoiceId` is still null, and that column is
 *   unique. A double click gets the same invoice back, never two.
 * - Creating the invoice counts against the plan's monthly invoice allowance.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const quote = await prisma.quote.findFirst({
      where: { id: params.id, companyId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (quote.convertedInvoiceId) {
      return NextResponse.json(
        { error: 'Already converted', code: 'ALREADY_CONVERTED', invoiceId: quote.convertedInvoiceId },
        { status: 409 }
      );
    }
    if (!canConvertQuote(quote)) {
      return NextResponse.json({ error: 'A rejected quote cannot become an invoice.', code: 'NOT_CONVERTIBLE' }, { status: 409 });
    }

    const denied = await enforcePlanLimit(companyId, 'invoicesPerMonth');
    if (denied) return denied;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultPaymentTerms: true },
    });
    const today = todayCalendarInput();
    const terms = company?.defaultPaymentTerms ?? 30;
    const { totals, rows, errors } = computeLineItems(itemsFromRows(quote.items));
    if (errors.length > 0) return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const claimed = await tx.quote.updateMany({
        // Compare-and-set on the value read above: a quote whose invoice was
        // deleted (convertedInvoiceId set null, convertedAt left behind) can be
        // converted again, while two concurrent clicks still make one invoice.
        where: { id: quote.id, companyId, convertedInvoiceId: null, convertedAt: quote.convertedAt },
        data: { convertedAt: new Date(), status: 'ACCEPTED' },
      });
      if (claimed.count !== 1) return null;

      const invoiceNumber = await allocateInvoiceNumber(tx, companyId);
      const invoice = await tx.invoice.create({
        data: {
          companyId,
          customerId: quote.customerId,
          invoiceNumber,
          status: 'DRAFT',
          issueDate: parseCalendarDate(today)!,
          dueDate: parseCalendarDate(addCalendarDays(today, terms))!,
          currency: quote.currency,
          ...totals,
          notes: quote.notes,
          items: { create: rows },
        },
        select: { id: true, invoiceNumber: true },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { convertedInvoiceId: invoice.id } });
      return invoice;
    });

    if (!result) {
      const fresh = await prisma.quote.findFirst({ where: { id: quote.id, companyId }, select: { convertedInvoiceId: true } });
      return NextResponse.json(
        { error: 'Already converted', code: 'ALREADY_CONVERTED', invoiceId: fresh?.convertedInvoiceId ?? null },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, invoiceId: result.id, invoiceNumber: result.invoiceNumber }, { status: 201 });
  } catch (error) {
    return handleApiError('quotes:convert', error, { fallbackMessage: 'The quote could not be converted.' });
  }
}

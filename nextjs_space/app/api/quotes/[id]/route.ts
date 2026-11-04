export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { quoteUpdateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { applyCompanyTaxLabel, computeLineItems } from '@/lib/line-items';
import { canEditQuote, canTransitionQuote } from '@/lib/quote-status';
import type { TxClient } from '@/lib/invoice-number';

const INCLUDE = {
  items: true,
  customer: true,
  convertedInvoice: { select: { id: true, invoiceNumber: true, status: true } },
} as const;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const quote = await prisma.quote.findFirst({ where: { id: params.id, companyId }, include: INCLUDE });
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(quote);
  } catch (error) {
    return handleApiError('quotes:GET:id', error, { fallbackMessage: 'Failed to load quote' });
  }
}

/**
 * A status change (`{ status }`), or — while the quote is a DRAFT — new
 * details and line items. Scoped by session companyId on every read and write.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const existing = await prisma.quote.findFirst({ where: { id: params.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = validateBody(quoteUpdateSchema, await request.json());
    if (error) return NextResponse.json(error, { status: 400 });

    // ---- Status only ----
    if (data.status && !data.items) {
      if (!canTransitionQuote(existing.status, data.status)) {
        return NextResponse.json(
          { error: `Cannot change from ${existing.status} to ${data.status}`, code: 'BAD_TRANSITION' },
          { status: 409 }
        );
      }
      const updated = await prisma.quote.updateMany({
        where: { id: existing.id, companyId, status: existing.status },
        data: { status: data.status },
      });
      if (updated.count === 0) return NextResponse.json({ error: 'The quote changed; reload and try again.' }, { status: 409 });
      return NextResponse.json(await prisma.quote.findFirst({ where: { id: existing.id, companyId }, include: INCLUDE }));
    }

    // ---- Details (draft only) ----
    if (!canEditQuote(existing)) {
      return NextResponse.json(
        { error: 'Only a draft quote can be edited.', code: 'NOT_EDITABLE' },
        { status: 409 }
      );
    }
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId }, select: { id: true } });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const company = data.items
      ? await prisma.company.findUnique({ where: { id: companyId }, select: { country: true } })
      : null;
    const computed = data.items ? computeLineItems(applyCompanyTaxLabel(data.items, company?.country)) : null;
    if (computed && computed.errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: computed.errors }, { status: 400 });
    }

    await prisma.$transaction(async (tx: TxClient) => {
      if (computed) await tx.quoteItem.deleteMany({ where: { quoteId: existing.id } });
      await tx.quote.update({
        where: { id: existing.id },
        data: {
          customerId: data.customerId ?? undefined,
          issueDate: parseCalendarDate(data.issueDate) ?? undefined,
          validUntil: parseCalendarDate(data.validUntil) ?? undefined,
          currency: data.currency ?? undefined,
          notes: data.notes ?? undefined,
          ...(computed ? { ...computed.totals, items: { create: computed.rows } } : {}),
        },
      });
    });
    return NextResponse.json(await prisma.quote.findFirst({ where: { id: existing.id, companyId }, include: INCLUDE }));
  } catch (error) {
    return handleApiError('quotes:PUT', error, { fallbackMessage: 'Failed to save quote' });
  }
}

/** Deletes a quote that has not been turned into an invoice. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const existing = await prisma.quote.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, convertedInvoiceId: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.convertedInvoiceId) {
      return NextResponse.json(
        { error: 'This quote became an invoice and is kept for the record.', code: 'CONVERTED' },
        { status: 409 }
      );
    }
    await prisma.quote.deleteMany({ where: { id: existing.id, companyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('quotes:DELETE', error, { fallbackMessage: 'Failed to delete quote' });
  }
}

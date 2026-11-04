export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { recurringUpdateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { applyCompanyTaxLabel, computeLineItems } from '@/lib/line-items';
import type { TxClient } from '@/lib/invoice-number';

const INCLUDE = {
  customer: { select: { id: true, name: true, email: true } },
  items: { orderBy: { position: 'asc' as const } },
  invoices: { select: { id: true, invoiceNumber: true, status: true, issueDate: true }, orderBy: { createdAt: 'desc' as const }, take: 24 },
} as const;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const template = await prisma.recurringInvoice.findFirst({ where: { id: params.id, companyId }, include: INCLUDE });
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(template);
  } catch (error) {
    return handleApiError('recurring:GET:id', error, { fallbackMessage: 'Failed to load recurring invoice' });
  }
}

/** Pause/resume, auto-send on/off, end date, terms, notes, items. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;
    const existing = await prisma.recurringInvoice.findFirst({ where: { id: params.id, companyId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = validateBody(recurringUpdateSchema, await request.json());
    if (error) return NextResponse.json(error, { status: 400 });

    const company = data.items
      ? await prisma.company.findUnique({ where: { id: companyId }, select: { country: true } })
      : null;
    const computed = data.items ? computeLineItems(applyCompanyTaxLabel(data.items, company?.country)) : null;
    if (computed && computed.errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: computed.errors }, { status: 400 });
    }

    await prisma.$transaction(async (tx: TxClient) => {
      if (computed) await tx.recurringInvoiceItem.deleteMany({ where: { recurringInvoiceId: existing.id } });
      await tx.recurringInvoice.update({
        where: { id: existing.id },
        data: {
          name: data.name ?? undefined,
          isActive: data.isActive ?? undefined,
          autoSend: data.autoSend ?? undefined,
          paymentTermsDays: data.paymentTermsDays ?? undefined,
          notes: data.notes ?? undefined,
          endDate: data.endDate === undefined ? undefined : data.endDate ? parseCalendarDate(data.endDate) : null,
          ...(computed
            ? {
                items: {
                  create: computed.rows.map((row, position) => ({
                    description: row.description,
                    quantity: row.quantity,
                    unitPrice: row.unitPrice,
                    discount: row.discount,
                    taxRate: row.taxRate,
                    taxLabel: row.taxLabel,
                    position,
                  })),
                },
              }
            : {}),
        },
      });
    });
    return NextResponse.json(await prisma.recurringInvoice.findFirst({ where: { id: existing.id, companyId }, include: INCLUDE }));
  } catch (error) {
    return handleApiError('recurring:PUT', error, { fallbackMessage: 'Failed to save recurring invoice' });
  }
}

/** Deletes the template. Invoices it already produced stay (link set to null). */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const deleted = await prisma.recurringInvoice.deleteMany({ where: { id: params.id, companyId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('recurring:DELETE', error, { fallbackMessage: 'Failed to delete recurring invoice' });
  }
}

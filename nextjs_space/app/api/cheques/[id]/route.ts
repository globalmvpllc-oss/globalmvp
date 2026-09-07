export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { chequeUpdateSchema, validateBody } from '@/lib/validation';
import { parseCalendarDate } from '@/lib/calendar-date';
import { isTerminal } from '@/lib/cheque-status';
import { verifyLinks } from '../route';

/**
 * One cheque or promissory note.
 *
 * Scoped `{ id, companyId }` on every statement, including the writes: the
 * ownership check and the update are separate round trips, and keeping the
 * scope on both means a row that changed hands in between still cannot be
 * written.
 *
 * `status` is not editable here. It moves only through
 * `PATCH /api/cheques/[id]/status`, which checks the transition and records the
 * payment when the instrument settles.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const cheque = await prisma.chequeInstrument.findFirst({
      where: { id: params.id, companyId },
      include: {
        customer: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        expense: { select: { id: true, description: true } },
        payment: { select: { id: true, amount: true, paymentDate: true } },
      },
    });
    if (!cheque) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(cheque);
  } catch (error) {
    return handleApiError('cheques:GET:id', error, { fallbackMessage: 'Failed' });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const existing = await prisma.chequeInstrument.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, status: true, direction: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /**
     * A settled instrument is a historical record.
     *
     * Editing the amount of a cleared cheque would leave the Payment it
     * produced disagreeing with it, and editing a bounced one would rewrite the
     * evidence of the bounce. Both are corrections that belong in a new row, so
     * the whole record is frozen once it reaches a terminal state.
     */
    if (isTerminal(existing.status)) {
      return NextResponse.json(
        {
          error: `This instrument is ${existing.status.toLowerCase()} and can no longer be edited. Record a new one instead.`,
        },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { data, error } = validateBody(chequeUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const linkError = await verifyLinks(companyId, data);
    if (linkError) return linkError;

    // The direction decides which party field is meaningful, so changing it
    // must clear the other one rather than leave a stale link behind.
    const direction = data.direction ?? existing.direction;

    const update: Record<string, unknown> = {};
    if (data.direction !== undefined) update.direction = data.direction;
    if (data.instrument !== undefined) update.instrument = data.instrument;
    if (data.amount !== undefined) update.amount = data.amount;
    if (data.currency !== undefined) update.currency = data.currency;
    if (data.issueDate !== undefined) update.issueDate = parseCalendarDate(data.issueDate);
    if (data.dueDate !== undefined) update.dueDate = parseCalendarDate(data.dueDate);
    if (data.bankName !== undefined) update.bankName = data.bankName || null;
    if (data.chequeNumber !== undefined) update.chequeNumber = data.chequeNumber || null;
    if (data.drawerName !== undefined) update.drawerName = data.drawerName || null;
    if (data.notes !== undefined) update.notes = data.notes || null;
    if (data.invoiceId !== undefined) update.invoiceId = data.invoiceId || null;
    if (data.expenseId !== undefined) update.expenseId = data.expenseId || null;
    if (data.customerId !== undefined || data.direction !== undefined) {
      update.customerId = direction === 'RECEIVED' ? data.customerId || null : null;
    }
    if (data.vendorId !== undefined || data.direction !== undefined) {
      update.vendorId = direction === 'ISSUED' ? data.vendorId || null : null;
    }

    const updated = await prisma.chequeInstrument.updateMany({
      where: { id: params.id, companyId },
      data: update,
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cheque = await prisma.chequeInstrument.findFirst({
      where: { id: params.id, companyId },
    });
    return NextResponse.json(cheque);
  } catch (error) {
    return handleApiError('cheques:PUT', error, {
      fallbackMessage: 'The instrument could not be saved',
    });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.chequeInstrument.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, paymentId: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /**
     * Deleting the instrument never deletes the money.
     *
     * `paymentId` is SetNull, so a cleared cheque's Payment survives with its
     * link cleared. That is deliberate: the payment is real, the invoice
     * balance depends on it, and removing a filing record must not silently
     * reopen a settled invoice.
     */
    const deleted = await prisma.chequeInstrument.deleteMany({
      where: { id: params.id, companyId },
    });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, paymentKept: Boolean(existing.paymentId) });
  } catch (error) {
    return handleApiError('cheques:DELETE', error, { fallbackMessage: 'Failed' });
  }
}

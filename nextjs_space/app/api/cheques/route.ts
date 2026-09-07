export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { chequeSchema, validateBody } from '@/lib/validation';
import { parseCalendarDate } from '@/lib/calendar-date';
import { parseCalendarRange, boundedTake, listResponse, RANGE_MAX } from '@/lib/calendar-range';
import { INITIAL_STATUS, isChequeDirection, isChequeStatus } from '@/lib/cheque-status';

/**
 * Cheques and promissory notes — çek ve senet.
 *
 * companyId comes from the session via `requireUserCompany`, never from the
 * request, and every read and write below carries it. An id in the request body
 * is not authorisation: a customerId, vendorId, invoiceId or expenseId offered
 * here is checked against this company before it is stored, so a hand-edited
 * request cannot attach an instrument to another business's records.
 *
 * ## Ordering
 *
 * By due date, ascending, because the question a portfolio answers is always
 * "what is coming up". `@@index([companyId, dueDate])` serves exactly this.
 *
 * ## Plan limits
 *
 * `enforcePlanLimit` is deliberately not called. The metered actions today are
 * invoices, expenses and PDFs; cheques are neither a document the product
 * generates nor a per-seat cost, and adding a meter would change billing, which
 * this task must not do. Recorded here so the decision is visible rather than
 * an omission.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const direction = searchParams.get('direction');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = { companyId };
    // Unrecognised filter values are ignored rather than rejected: a stale
    // bookmark should show the unfiltered list, not an error page.
    if (isChequeDirection(direction)) where.direction = direction;
    if (isChequeStatus(status)) where.status = status;
    if (range) where.dueDate = range;

    const take = boundedTake(searchParams);
    const rows = await prisma.chequeInstrument.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        expense: { select: { id: true, description: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: (range ? RANGE_MAX : take) + 1,
    });

    return listResponse(rows, range ? RANGE_MAX : take);
  } catch (error) {
    return handleApiError('cheques:GET', error, {
      fallbackMessage: 'Failed to load cheques and notes',
    });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(chequeSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    /**
     * Every foreign key is verified against this company before it is stored.
     *
     * Scoped `{ id, companyId }` in each case, the same check every other route
     * makes. Without it a request naming another business's invoice id would
     * create a row linking the two.
     */
    const linkError = await verifyLinks(companyId, data);
    if (linkError) return linkError;

    const created = await prisma.chequeInstrument.create({
      data: {
        companyId,
        direction: data.direction,
        instrument: data.instrument,
        amount: data.amount,
        currency: data.currency,
        issueDate: parseCalendarDate(data.issueDate) ?? parseCalendarDate(new Date())!,
        dueDate: parseCalendarDate(data.dueDate)!,
        bankName: data.bankName ?? null,
        chequeNumber: data.chequeNumber ?? null,
        drawerName: data.drawerName ?? null,
        // Never taken from the request: where an instrument starts is decided
        // by its direction, and every move after that goes through the
        // transition endpoint.
        status: INITIAL_STATUS[data.direction],
        notes: data.notes ?? null,
        customerId: data.direction === 'RECEIVED' ? data.customerId ?? null : null,
        vendorId: data.direction === 'ISSUED' ? data.vendorId ?? null : null,
        invoiceId: data.invoiceId ?? null,
        expenseId: data.expenseId ?? null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError('cheques:POST', error, {
      fallbackMessage: 'Failed to record the instrument',
    });
  }
}

/**
 * Checks every optional link against the caller's own company.
 *
 * Returns a response to send, or null when everything named belongs here.
 * Exported for the update route, which has to make exactly the same checks.
 */
export async function verifyLinks(
  companyId: string,
  data: {
    customerId?: string;
    vendorId?: string;
    invoiceId?: string;
    expenseId?: string;
  }
): Promise<NextResponse | null> {
  if (data.customerId) {
    const found = await prisma.customer.findFirst({
      where: { id: data.customerId, companyId },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  if (data.vendorId) {
    const found = await prisma.vendor.findFirst({
      where: { id: data.vendorId, companyId },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
  }
  if (data.invoiceId) {
    const found = await prisma.invoice.findFirst({
      where: { id: data.invoiceId, companyId },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (data.expenseId) {
    const found = await prisma.expenseTransaction.findFirst({
      where: { id: data.expenseId, companyId },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
  return null;
}

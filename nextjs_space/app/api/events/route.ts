export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { eventCreateSchema, eventRangeSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { verifyEventRelations } from '@/lib/event-helpers';
import { optionalText, optionalDate, EVENT_SELECT } from '@/lib/event-fields';

/**
 * GET /api/events?from=...&to=...
 *
 * Events for the caller's company, optionally limited to a date window so the
 * calendar fetches one month rather than the whole history.
 *
 * The window is half-open: [from, to). A `lte` on `to` would drop everything
 * recorded on the final day after midnight — the same bug the dashboard month
 * boundaries had.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { data: range, error: rangeError } = validateBody(eventRangeSchema, {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });
    if (rangeError) return NextResponse.json(rangeError, { status: 400 });

    const startAt: { gte?: Date; lt?: Date } = {};
    if (range.from) startAt.gte = new Date(range.from);
    if (range.to) startAt.lt = new Date(range.to);

    const events = await prisma.event.findMany({
      // companyId comes from the session, never from the request.
      where: {
        companyId,
        ...(range.from || range.to ? { startAt } : {}),
      },
      select: EVENT_SELECT,
      orderBy: { startAt: 'asc' },
      take: 500,
    });

    return NextResponse.json(events);
  } catch (error) {
    return handleApiError('events:GET', error, { fallbackMessage: 'Failed to load events' });
  }
}

/** POST /api/events — creates a manual calendar entry. */
export async function POST(request: Request) {
  try {
    const { error: authError, user, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(eventCreateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const customerId = optionalText(data.customerId);
    const invoiceId = optionalText(data.invoiceId);

    const relations = await verifyEventRelations(companyId, customerId, invoiceId);
    if (!relations.ok) {
      return NextResponse.json({ error: relations.message }, { status: 404 });
    }

    const event = await prisma.event.create({
      data: {
        companyId,
        createdById: user?.id ?? null,
        title: data.title,
        description: optionalText(data.description) ?? null,
        startAt: new Date(data.startAt),
        endAt: optionalDate(data.endAt) ?? null,
        allDay: data.allDay ?? false,
        type: data.type ?? 'OTHER',
        status: data.status ?? 'PLANNED',
        // Set by the server, not accepted from the client. Rows created here are
        // always manual; derived financial entries are computed at query time
        // and never written to this table.
        source: 'MANUAL',
        customerId: customerId ?? null,
        invoiceId: invoiceId ?? null,
        amount: data.amount ?? null,
        currency: data.currency ?? null,
        reminderAt: optionalDate(data.reminderAt) ?? null,
      },
      select: EVENT_SELECT,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError('events:POST', error, { fallbackMessage: 'Failed to create event' });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { eventUpdateSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { verifyEventRelations } from '@/lib/event-helpers';
import { optionalText, optionalDate, EVENT_SELECT } from '@/lib/event-fields';

/**
 * Single-event read, update and delete.
 *
 * Every handler scopes by `{ id, companyId }` where companyId comes from the
 * session. Knowing another company's event id is not enough to reach it: the
 * lookup simply finds nothing and the caller gets a 404, which also avoids
 * confirming that the id exists at all.
 *
 * Mutations use `updateMany` / `deleteMany` with the same pair rather than
 * `update({ where: { id } })`, so ownership is enforced by the write itself
 * and not only by a preceding read.
 */

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const event = await prisma.event.findFirst({
      where: { id: params.id, companyId },
      select: EVENT_SELECT,
    });
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(event);
  } catch (error) {
    return handleApiError('events:[id]:GET', error, { fallbackMessage: 'Failed to load event' });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(eventUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const existing = await prisma.event.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, startAt: true, endAt: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const customerId = optionalText(data.customerId);
    const invoiceId = optionalText(data.invoiceId);

    const relations = await verifyEventRelations(companyId, customerId, invoiceId);
    if (!relations.ok) {
      return NextResponse.json({ error: relations.message }, { status: 404 });
    }

    // A partial update can move one end of the range without the other, so the
    // ordering rule is re-checked against whatever the stored values will be.
    const nextStart = data.startAt ? new Date(data.startAt) : existing.startAt;
    const nextEnd =
      data.endAt === undefined ? existing.endAt : data.endAt === '' ? null : new Date(data.endAt);
    if (nextEnd && nextEnd < nextStart) {
      return NextResponse.json(
        { error: 'End time cannot be before the start time' },
        { status: 400 }
      );
    }

    await prisma.event.updateMany({
      where: { id: params.id, companyId },
      data: {
        title: data.title,
        description: optionalText(data.description),
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: optionalDate(data.endAt),
        allDay: data.allDay,
        type: data.type,
        status: data.status,
        customerId,
        invoiceId,
        amount: data.amount,
        currency: data.currency,
        reminderAt: optionalDate(data.reminderAt),
      },
    });

    const updated = await prisma.event.findFirst({
      where: { id: params.id, companyId },
      select: EVENT_SELECT,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError('events:[id]:PATCH', error, { fallbackMessage: 'Failed to update event' });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const result = await prisma.event.deleteMany({
      where: { id: params.id, companyId },
    });

    // deleteMany reports how many rows matched. Zero means the event either does
    // not exist or belongs to another company — indistinguishable to the caller
    // by design.
    if (result.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('events:[id]:DELETE', error, { fallbackMessage: 'Failed to delete event' });
  }
}

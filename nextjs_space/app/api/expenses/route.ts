export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { expenseSchema, expenseUpdateSchema, validateBody } from '@/lib/validation';
import { parseCalendarDate } from '@/lib/calendar-date';
import { parseCalendarRange, RANGE_MAX, boundedTake, listResponse } from '@/lib/calendar-range';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);

    // Range filters on dueDate, which is the field the calendar derives its
    // expense entries from.
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const take = boundedTake(searchParams);

    const transactions = await prisma.expenseTransaction.findMany({
      where: range ? { companyId, dueDate: range } : { companyId },
      include: { vendor: { select: { name: true } } },
      orderBy: { date: 'desc' },
      // One extra row is fetched purely to detect truncation.
      take: (range ? RANGE_MAX : take) + 1,
    });

    return listResponse(transactions, range ? RANGE_MAX : take);
  } catch (error) {
    return handleApiError('expenses:GET', error, { fallbackMessage: 'Failed' });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(expenseSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    if (data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, companyId } });
      if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const transaction = await prisma.expenseTransaction.create({
      data: {
        companyId,
        vendorId: data.vendorId || null,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        date: parseCalendarDate(data.date) ?? parseCalendarDate(new Date())!,
        dueDate: parseCalendarDate(data.dueDate),
        status: data.status ?? 'UNPAID',
        notes: data.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error) {
    return handleApiError('expenses:POST', error, { fallbackMessage: 'Failed' });
  }
}

export async function PUT(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(expenseUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const existing = await prisma.expenseTransaction.findFirst({ where: { id: data.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, companyId } });
      if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const transaction = await prisma.expenseTransaction.update({
      where: { id: data.id },
      data: {
        vendorId: data.vendorId !== undefined ? (data.vendorId || null) : existing.vendorId,
        description: data.description ?? existing.description,
        category: data.category ?? existing.category,
        amount: data.amount ?? existing.amount,
        currency: data.currency ?? existing.currency,
        date: parseCalendarDate(data.date) ?? existing.date,
        dueDate: parseCalendarDate(data.dueDate) ?? existing.dueDate,
        status: data.status ?? existing.status,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error) {
    return handleApiError('expenses:PUT', error, { fallbackMessage: 'Failed' });
  }
}

export async function DELETE(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const existing = await prisma.expenseTransaction.findFirst({
      where: { id, companyId },
      select: { id: true, _count: { select: { payments: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Payment.expenseId is ON DELETE SET NULL, so deleting an expense that has
    // payments leaves those payment rows attached to nothing — invisible in every
    // report and impossible to reconcile.
    if (existing._count.payments > 0) {
      return NextResponse.json(
        {
          error: `Expense has ${existing._count.payments} payment(s) and cannot be deleted. Delete the payments first.`,
        },
        { status: 409 }
      );
    }

    const deleted = await prisma.expenseTransaction.deleteMany({ where: { id, companyId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('expenses:DELETE', error, { fallbackMessage: 'Failed' });
  }
}

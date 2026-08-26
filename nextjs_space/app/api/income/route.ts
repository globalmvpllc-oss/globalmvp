export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { incomeSchema, incomeUpdateSchema, validateBody } from '@/lib/validation';
import { parseCalendarDate } from '@/lib/calendar-date';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const transactions = await prisma.incomeTransaction.findMany({
      where: { companyId },
      include: { customer: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(transactions);
  } catch (error) {
    return handleApiError('income:GET', error, { fallbackMessage: 'Failed' });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(incomeSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    // Verify customer if provided
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId } });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const transaction = await prisma.incomeTransaction.create({
      data: {
        companyId,
        customerId: data.customerId || null,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        date: parseCalendarDate(data.date) ?? parseCalendarDate(new Date())!,
        expectedPaymentDate: parseCalendarDate(data.expectedPaymentDate),
        status: data.status ?? 'EXPECTED',
        notes: data.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error) {
    return handleApiError('income:POST', error, { fallbackMessage: 'Failed' });
  }
}

export async function PUT(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(incomeUpdateSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const existing = await prisma.incomeTransaction.findFirst({ where: { id: data.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId } });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const transaction = await prisma.incomeTransaction.update({
      where: { id: data.id },
      data: {
        customerId: data.customerId !== undefined ? (data.customerId || null) : existing.customerId,
        description: data.description ?? existing.description,
        category: data.category ?? existing.category,
        amount: data.amount ?? existing.amount,
        currency: data.currency ?? existing.currency,
        date: parseCalendarDate(data.date) ?? existing.date,
        expectedPaymentDate: parseCalendarDate(data.expectedPaymentDate) ?? existing.expectedPaymentDate,
        status: data.status ?? existing.status,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error) {
    return handleApiError('income:PUT', error, { fallbackMessage: 'Failed' });
  }
}

export async function DELETE(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const existing = await prisma.incomeTransaction.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const deleted = await prisma.incomeTransaction.deleteMany({ where: { id, companyId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError('income:DELETE', error, { fallbackMessage: 'Failed' });
  }
}

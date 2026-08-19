export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { incomeSchema, incomeUpdateSchema, validateBody } from '@/lib/validation';

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
  } catch (error: any) {
    console.error('Income fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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
        date: data.date ? new Date(data.date) : new Date(),
        expectedPaymentDate: data.expectedPaymentDate ? new Date(data.expectedPaymentDate) : null,
        status: data.status ?? 'EXPECTED',
        notes: data.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Income create error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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
        date: data.date ? new Date(data.date) : existing.date,
        expectedPaymentDate: data.expectedPaymentDate ? new Date(data.expectedPaymentDate) : existing.expectedPaymentDate,
        status: data.status ?? existing.status,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Income update error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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

    await prisma.incomeTransaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Income delete error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

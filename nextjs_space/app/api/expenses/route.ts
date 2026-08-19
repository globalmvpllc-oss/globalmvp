export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { expenseSchema, expenseUpdateSchema, validateBody } from '@/lib/validation';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const transactions = await prisma.expenseTransaction.findMany({
      where: { companyId },
      include: { vendor: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error('Expenses fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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
        date: data.date ? new Date(data.date) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status ?? 'UNPAID',
        notes: data.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Expense create error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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
        date: data.date ? new Date(data.date) : existing.date,
        dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
        status: data.status ?? existing.status,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Expense update error:', error);
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

    const existing = await prisma.expenseTransaction.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.expenseTransaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Expense delete error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { customerSchema, validateBody } from '@/lib/validation';
import Decimal from 'decimal.js';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, companyId },
      include: {
        invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let totalInvoiced = new Decimal(0);
    let totalPaid = new Decimal(0);
    for (const inv of customer.invoices ?? []) {
      totalInvoiced = totalInvoiced.plus(new Decimal(inv.total.toString()));
      totalPaid = totalPaid.plus(new Decimal(inv.amountPaid.toString()));
    }

    return NextResponse.json({
      ...customer,
      totalInvoiced: totalInvoiced.toNumber(),
      totalPaid: totalPaid.toNumber(),
      outstanding: totalInvoiced.minus(totalPaid).toNumber(),
    });
  } catch (error: any) {
    console.error('Customer fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const existing = await prisma.customer.findFirst({ where: { id: params.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { data, error } = validateBody(customerSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        name: data.name,
        companyName: data.companyName,
        email: data.email || undefined,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country,
        taxId: data.taxId,
        defaultCurrency: data.defaultCurrency || undefined,
        notes: data.notes,
      },
    });
    return NextResponse.json(customer);
  } catch (error: any) {
    console.error('Customer update error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;
    const existing = await prisma.customer.findFirst({ where: { id: params.id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.customer.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Customer delete error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { customerSchema, validateBody } from '@/lib/validation';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const customers = await prisma.customer.findMany({
      where: { companyId },
      include: { _count: { select: { invoices: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(customers);
  } catch (error: any) {
    console.error('Customers fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(customerSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const customer = await prisma.customer.create({
      data: {
        companyId,
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
    console.error('Customer create error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

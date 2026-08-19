export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { vendorSchema, validateBody } from '@/lib/validation';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const vendors = await prisma.vendor.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    return NextResponse.json(vendors);
  } catch (error: any) {
    console.error('Vendors error:', error);
    return NextResponse.json({ error: 'Failed to load vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const body = await request.json();
    const parsed = validateBody(vendorSchema, body);
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

    const { name, companyName, email, phone, address, country, taxId, notes } = parsed.data;

    const vendor = await prisma.vendor.create({
      data: {
        companyId,
        name,
        companyName: companyName ?? null,
        email: email || null,
        phone: phone ?? null,
        address: address ?? null,
        country: country ?? null,
        taxId: taxId ?? null,
        notes: notes ?? null,
      },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (error: any) {
    console.error('Vendor create error:', error);
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
  }
}

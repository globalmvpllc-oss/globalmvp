export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { vendorSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const vendors = await prisma.vendor.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    return NextResponse.json(vendors);
  } catch (error) {
    return handleApiError('vendors:GET', error, { fallbackMessage: 'Failed to load vendors' });
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

    // Vendor has no unique constraint in the schema (unlike Category), so the
    // duplicate guard is enforced here. Case-insensitive within the company.
    const duplicate = await prisma.vendor.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'A vendor with this name already exists' },
        { status: 409 }
      );
    }

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
  } catch (error) {
    return handleApiError('vendors:POST', error, {
      conflictMessage: 'A vendor with this name already exists',
      fallbackMessage: 'Failed to create vendor',
    });
  }
}

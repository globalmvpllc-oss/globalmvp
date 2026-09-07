export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { vendorSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { boundedTake, listResponse } from '@/lib/calendar-range';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const take = boundedTake(new URL(request.url).searchParams);
    const vendors = await prisma.vendor.findMany({
      where: { companyId },
      // The expense count drives the vendor list card, the same way the customer
      // list shows an invoice count. Additive: the expense dialog reads name and
      // id and is unaffected.
      include: { _count: { select: { expenseTransactions: true } } },
      orderBy: { name: 'asc' },
      take: take + 1,
    });
    return listResponse(vendors, take);
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

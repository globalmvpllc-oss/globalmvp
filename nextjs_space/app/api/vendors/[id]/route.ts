export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { vendorSchema, validateBody } from '@/lib/validation';
import { checkPartyTaxId } from '@/lib/party-tax';
import { optionalCustomerText } from '@/lib/customer-fields';

/**
 * One vendor, for the vendor detail page.
 *
 * GET reads it; PUT edits its details (name, contact, tax number, tax office).
 * There is still no DELETE: ExpenseTransaction.vendorId is ON DELETE SET NULL,
 * so removing a vendor would orphan its expense history, and that needs its
 * own guard and screen.
 *
 * Scoped by `{ id, companyId }` from the session. The id in the URL is not
 * authorisation.
 */
const VENDOR_SELECT = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  address: true,
  country: true,
  taxId: true,
  taxOffice: true,
  notes: true,
  createdAt: true,
  _count: { select: { expenseTransactions: true } },
} as const;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const vendor = await prisma.vendor.findFirst({
      where: { id: params.id, companyId },
      select: VENDOR_SELECT,
    });
    if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(vendor);
  } catch (error) {
    return handleApiError('vendors:GET:id', error, { fallbackMessage: 'Failed to load vendor' });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const existing = await prisma.vendor.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const parsed = validateBody(vendorSchema, await request.json());
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });
    const data = parsed.data;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true },
    });
    const tax = checkPartyTaxId(data.taxId, data.country, company?.country);
    if (!tax.ok) return NextResponse.json(tax.response, { status: 400 });

    // Same case-insensitive duplicate guard as POST, ignoring this vendor.
    const duplicate = await prisma.vendor.findFirst({
      where: {
        companyId,
        id: { not: params.id },
        name: { equals: data.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'A vendor with this name already exists' }, { status: 409 });
    }

    // Scoped by companyId on the write as well. '' clears a field.
    const updated = await prisma.vendor.updateMany({
      where: { id: params.id, companyId },
      data: {
        name: data.name,
        companyName: optionalCustomerText(data.companyName),
        email: optionalCustomerText(data.email),
        phone: optionalCustomerText(data.phone),
        address: optionalCustomerText(data.address),
        country: optionalCustomerText(data.country),
        taxId: optionalCustomerText(tax.taxId),
        taxOffice: optionalCustomerText(data.taxOffice),
        notes: optionalCustomerText(data.notes),
      },
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const vendor = await prisma.vendor.findFirst({
      where: { id: params.id, companyId },
      select: VENDOR_SELECT,
    });
    return NextResponse.json(vendor);
  } catch (error) {
    return handleApiError('vendors:PUT', error, {
      conflictMessage: 'A vendor with this name already exists',
      fallbackMessage: 'Failed to save vendor',
    });
  }
}

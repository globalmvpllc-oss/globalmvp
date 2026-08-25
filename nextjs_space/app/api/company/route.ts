export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser, requireUserCompany } from '@/lib/auth-helpers';
import { companySchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { type TxClient } from '@/lib/payment-calc';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { data, error } = validateBody(companySchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const defaultCategories = [
      { name: 'Services', type: 'income', color: '#7C3AED' },
      { name: 'Products', type: 'income', color: '#2563EB' },
      { name: 'Consulting', type: 'income', color: '#059669' },
      { name: 'Other Income', type: 'income', color: '#6B7280' },
      { name: 'Office Supplies', type: 'expense', color: '#EF4444' },
      { name: 'Rent', type: 'expense', color: '#F59E0B' },
      { name: 'Utilities', type: 'expense', color: '#8B5CF6' },
      { name: 'Software', type: 'expense', color: '#3B82F6' },
      { name: 'Marketing', type: 'expense', color: '#EC4899' },
      { name: 'Travel', type: 'expense', color: '#14B8A6' },
      { name: 'Insurance', type: 'expense', color: '#F97316' },
      { name: 'Other Expense', type: 'expense', color: '#6B7280' },
    ];

    // The duplicate check, the company insert, the membership insert and the
    // default categories all run in one Serializable transaction. Previously the
    // check and the insert were separate statements, so two concurrent requests
    // could each pass the check and create a second, unreachable company.
    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        const existingMember = await tx.companyMember.findFirst({
          where: { userId: user.id },
          select: { id: true },
        });
        if (existingMember) {
          return { kind: 'error' as const, status: 409, message: 'You already belong to a company' };
        }

        const created = await tx.company.create({
          data: {
            name: data.name,
            country: data.country ?? 'US',
            defaultCurrency: data.defaultCurrency ?? 'USD',
            // These were accepted by the schema and written by PUT, but silently
            // dropped on create, so onboarding data was lost.
            timezone: data.timezone ?? undefined,
            locale: data.locale ?? undefined,
            businessType: data.businessType,
            address: data.address,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            phone: data.phone,
            email: data.email || undefined,
            website: data.website,
            legalName: data.legalName,
            taxNumber: data.taxNumber,
            taxOffice: data.taxOffice,
            members: { create: { userId: user.id, role: 'owner' } },
          },
        });

        await tx.category.createMany({
          data: defaultCategories.map((c) => ({ ...c, companyId: created.id })),
        });

        return { kind: 'ok' as const, company: created };
      },
      { isolationLevel: 'Serializable' }
    );

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    const company = result.company;

    return NextResponse.json(company);
  } catch (error) {
    return handleApiError('company:POST', error, { fallbackMessage: 'Failed to create company' });
  }
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const member = await prisma.companyMember.findFirst({
      where: { userId: user.id },
      include: { company: true },
    });
    if (!member) return NextResponse.json(null);
    return NextResponse.json(member.company);
  } catch (error) {
    return handleApiError('company:GET', error, { fallbackMessage: 'Failed to fetch company' });
  }
}

export async function PUT(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(companySchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    // A logo must be an object this company uploaded. The presigned upload
    // endpoint always writes to `.../uploads/{companyId}/...`, so requiring that
    // segment stops one company from pointing its logo at another company's
    // object, or at an arbitrary external URL.
    if (data.logoUrl) {
      if (!data.logoUrl.includes(`uploads/${companyId}/`)) {
        return NextResponse.json(
          { error: 'Logo must be a file uploaded to this company' },
          { status: 400 }
        );
      }
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        name: data.name,
        country: data.country,
        defaultCurrency: data.defaultCurrency,
        timezone: data.timezone,
        locale: data.locale,
        businessType: data.businessType,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        phone: data.phone,
        email: data.email || undefined,
        website: data.website,
        taxNumber: data.taxNumber,
        taxOffice: data.taxOffice,
        legalName: data.legalName,
        // Empty string clears the logo; undefined leaves the existing one alone.
        logoUrl: data.logoUrl === '' ? null : data.logoUrl,
      },
    });
    return NextResponse.json(company);
  } catch (error) {
    return handleApiError('company:PUT', error, { fallbackMessage: 'Failed to update company' });
  }
}

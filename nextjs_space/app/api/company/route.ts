export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser, requireUserCompany } from '@/lib/auth-helpers';
import { companySchema, validateBody } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Prevent duplicate company creation
    const existingMember = await prisma.companyMember.findFirst({ where: { userId: user.id } });
    if (existingMember) {
      return NextResponse.json({ error: 'You already belong to a company' }, { status: 400 });
    }

    const body = await request.json();
    const { data, error } = validateBody(companySchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const company = await prisma.company.create({
      data: {
        name: data.name,
        country: data.country ?? 'US',
        defaultCurrency: data.defaultCurrency ?? 'USD',
        businessType: data.businessType,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        taxNumber: data.taxNumber,
        taxOffice: data.taxOffice,
        members: { create: { userId: user.id, role: 'owner' } },
      },
    });

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
    await prisma.category.createMany({
      data: defaultCategories.map((c: any) => ({ ...c, companyId: company.id })),
    });

    return NextResponse.json(company);
  } catch (error: any) {
    console.error('Company create error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
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
  } catch (error: any) {
    console.error('Company fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(companySchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

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
      },
    });
    return NextResponse.json(company);
  } catch (error: any) {
    console.error('Company update error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

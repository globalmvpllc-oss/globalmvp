export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { categorySchema, validateBody } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const where: Record<string, unknown> = { companyId };
    if (type === 'income' || type === 'expense') where.type = type;

    const categories = await prisma.category.findMany({ where, orderBy: { name: 'asc' } });
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Categories error:', error);
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const body = await request.json();
    const parsed = validateBody(categorySchema, body);
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

    const { name, type, color } = parsed.data;

    const category = await prisma.category.create({
      data: { companyId, name, type, color: color ?? null },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error('Category create error:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

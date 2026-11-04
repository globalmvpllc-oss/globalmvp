export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/stock/public/staff?code=<staffCode>
 *
 * The company's own KolayStok sign-in link: the company name and the names of
 * its active staff, for the "pick your name" screen. Nothing else — no ids of
 * other companies, no roles, no PIN state.
 */
export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code') ?? '';
    if (!/^[a-z0-9]{6,32}$/.test(code)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const settings = await prisma.stockSettings.findUnique({
      where: { staffCode: code },
      select: {
        company: {
          select: {
            name: true,
            stockStaff: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
          },
        },
      },
    });
    if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ companyName: settings.company.name, staff: settings.company.stockStaff });
  } catch (error) {
    return handleApiError('stock:public:staff', error, { fallbackMessage: 'Could not load.' });
  }
}

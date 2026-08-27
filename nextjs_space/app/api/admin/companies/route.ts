export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin, parsePagination, parseSearch } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * Companies, for administrators.
 *
 * Authorised on its own, not by virtue of sitting under /api/admin: a route
 * that trusts its neighbours is one refactor away from being open.
 *
 * The select list is explicit, so no credential or hash can travel in a
 * response by accident.
 */
export async function GET(request: Request) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const params = new URL(request.url).searchParams;
    const { page, pageSize, skip } = parsePagination(params);
    const search = parseSearch(params);

    const where: Record<string, unknown> = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' as const } }];

    const [total, items] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          country: true,
          defaultCurrency: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
          _count: { select: { members: true, invoices: true, payments: true, customers: true } },
        },
      }),
    ]);

    await recordAudit({
      admin: gate.admin,
      action: 'admin.companies.listed',
      request,
      metadata: { page, pageSize, searched: search !== null },
    });

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return handleApiError('admin:companies', error, { fallbackMessage: 'Could not load companies.' });
  }
}

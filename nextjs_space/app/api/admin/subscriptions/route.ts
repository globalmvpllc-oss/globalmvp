export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin, parsePagination, parseSearch } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * Subscriptions, for administrators.
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
    if (search) where.OR = [{ company: { name: { contains: search, mode: 'insensitive' as const } } }];

    const [total, items] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        orderBy: { currentPeriodEnd: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          plan: true,
          status: true,
          interval: true,
          amount: true,
          currency: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);

    await recordAudit({
      admin: gate.admin,
      action: 'admin.subscriptions.listed',
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
    return handleApiError('admin:subscriptions', error, { fallbackMessage: 'Could not load subscriptions.' });
  }
}

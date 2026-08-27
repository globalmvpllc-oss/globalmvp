export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin, parsePagination, parseSearch } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * The audit trail, paginated and filterable.
 *
 * Authorised independently of every other route: a page must not be able to
 * lend its access to an endpoint.
 */
export async function GET(request: Request) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const params = new URL(request.url).searchParams;
    const { page, pageSize, skip } = parsePagination(params);
    const search = parseSearch(params);
    const action = params.get('action');
    const companyId = params.get('companyId');
    const from = params.get('from');
    const to = params.get('to');

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (companyId) where.companyId = companyId;
    // Optional date window. Each bound is applied only when it parses, so a
    // malformed value narrows nothing rather than throwing.
    const createdAt: { gte?: Date; lte?: Date } = {};
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
    if (fromDate && !Number.isNaN(fromDate.getTime())) createdAt.gte = fromDate;
    if (toDate && !Number.isNaN(toDate.getTime())) createdAt.lte = toDate;
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
    if (search) {
      where.OR = [
        { actorEmail: { contains: search, mode: 'insensitive' as const } },
        { entityId: { contains: search, mode: 'insensitive' as const } },
        { action: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [total, entries, actions] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      // Distinct actions present, so the filter offers only what exists.
      prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } }),
    ]);

    // Reading the trail is itself an administrative action.
    await recordAudit({
      admin: gate.admin,
      action: 'admin.audit.listed',
      request,
      metadata: {
        page,
        pageSize,
        filtered: Boolean(action || companyId || search || from || to),
      },
    });

    return NextResponse.json({
      entries,
      actions: actions.map((row: { action: string; _count: { _all: number } }) => ({
        action: row.action,
        count: row._count._all,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return handleApiError('admin:audit', error, {
      fallbackMessage: 'Could not load the audit log.',
    });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireAdmin, parsePagination, parseSearch } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * Paginated user listing for the admin panel.
 *
 * Authorisation is resolved server-side on every call; there is no header or
 * body field a caller can set to reach this. The page size is clamped, so the
 * endpoint cannot be turned into a full table export by asking for a large one.
 *
 * The selected columns are deliberate: no password hash, no session token, no
 * provider credential ever leaves this route.
 */
export async function GET(request: Request) {
  try {
    const gate = await requireAdmin();
    if ('response' in gate) return gate.response;

    const params = new URL(request.url).searchParams;
    const { page, pageSize, skip } = parsePagination(params);
    const search = parseSearch(params);

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          emailVerified: true,
          companyMembers: {
            select: {
              role: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  country: true,
                  defaultCurrency: true,
                  subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    await recordAudit({
      admin: gate.admin,
      action: 'admin.users.listed',
      request,
      metadata: { page, pageSize, searched: search !== null },
    });

    return NextResponse.json({
      users,
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return handleApiError('admin:users', error, {
      fallbackMessage: 'Could not load users.',
    });
  }
}

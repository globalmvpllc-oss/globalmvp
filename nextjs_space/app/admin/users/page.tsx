import Link from 'next/link';
import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.users.listed');
  if (!context) return null;
  const { page, pageSize, skip, search } = context;

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
      // Explicit select. hashedPassword, tokens and provider credentials are
      // never read, so they cannot reach the page by accident.
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        companyMembers: {
          select: {
            role: true,
            company: {
              select: {
                id: true,
                name: true,
                subscription: { select: { plan: true, status: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">{total} accounts</p>
      </div>

      <AdminListControls
        basePath="/admin/users"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search name or email"
      />

      <AdminTable
        rows={users as any[]}
        emptyMessage="No users match this search."
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (u: any) => (
              <Link href={`/admin/users/${u.id}`} className="text-primary hover:underline">
                {u.name ?? u.email}
              </Link>
            ),
          },
          { key: 'email', header: 'Email', cell: (u: any) => u.email },
          {
            key: 'company',
            header: 'Company',
            cell: (u: any) => u.companyMembers?.[0]?.company?.name ?? '—',
          },
          {
            key: 'plan',
            header: 'Plan',
            cell: (u: any) => u.companyMembers?.[0]?.company?.subscription?.plan ?? 'free',
          },
          {
            key: 'verified',
            header: 'Email verified',
            cell: (u: any) => (u.emailVerified ? 'yes' : 'no'),
          },
          {
            key: 'created',
            header: 'Created',
            className: 'font-mono text-xs',
            cell: (u: any) => u.createdAt.toISOString().slice(0, 10),
          },
        ]}
      />

      <p className="text-xs text-muted-foreground">
        The User model has no active/inactive field and records no last-login time, so neither is
        shown. Adding either needs a schema change.
      </p>
    </div>
  );
}

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';

export const dynamic = 'force-dynamic';

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.companies.listed');
  if (!context) return null;
  const { page, pageSize, skip, search } = context;

  const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

  const [total, companies] = await Promise.all([
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
        members: { select: { user: { select: { email: true } } }, take: 1 },
        _count: { select: { members: true, invoices: true, payments: true, customers: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground">{total} companies</p>
      </div>

      <AdminListControls
        basePath="/admin/companies"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search company name"
      />

      <AdminTable
        rows={companies as any[]}
        emptyMessage="No companies match this search."
        columns={[
          {
            key: 'name',
            header: 'Company',
            cell: (c: any) => (
              <Link href={`/admin/companies/${c.id}`} className="text-primary hover:underline">
                {c.name}
              </Link>
            ),
          },
          { key: 'owner', header: 'Owner', cell: (c: any) => c.members?.[0]?.user?.email ?? '\u2014' },
          { key: 'country', header: 'Country', cell: (c: any) => c.country },
          { key: 'currency', header: 'Currency', cell: (c: any) => c.defaultCurrency },
          { key: 'users', header: 'Users', cell: (c: any) => c._count.members },
          { key: 'invoices', header: 'Invoices', cell: (c: any) => c._count.invoices },
          { key: 'payments', header: 'Payments', cell: (c: any) => c._count.payments },
          { key: 'customers', header: 'Customers', cell: (c: any) => c._count.customers },
          { key: 'plan', header: 'Plan', cell: (c: any) => c.subscription?.plan ?? 'free' },
          {
            key: 'created',
            header: 'Created',
            className: 'font-mono text-xs',
            cell: (c: any) => c.createdAt.toISOString().slice(0, 10),
          },
        ]}
      />
    </div>
  );
}

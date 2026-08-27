import Link from 'next/link';
import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';
import { formatCurrency } from '@/lib/currencies';

/**
 * Global invoice view. Read-only: the admin panel never recalculates a total,
 * it displays what the invoicing code already stored.
 */
export const dynamic = 'force-dynamic';

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.invoices.listed');
  if (!context) return null;
  const { page, pageSize, skip, search, params } = context;

  const status = params.get('status');
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
      { company: { name: { contains: search, mode: 'insensitive' as const } } },
    ];
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        company: { select: { name: true } },
        customer: { select: { name: true, companyName: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">{total} invoices across all companies</p>
      </div>

      <AdminListControls
        basePath="/admin/invoices"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search invoice number or company"
        extraParams={{ status: status ?? undefined }}
      />

      <AdminTable
        rows={invoices as any[]}
        emptyMessage="No invoices match this search."
        columns={[
          {
            key: 'number',
            header: 'Invoice',
            cell: (i: any) => (
              <Link href={`/admin/invoices/${i.id}`} className="text-primary hover:underline">
                {i.invoiceNumber}
              </Link>
            ),
          },
          { key: 'company', header: 'Company', cell: (i: any) => i.company?.name ?? '\u2014' },
          {
            key: 'customer',
            header: 'Customer',
            cell: (i: any) => i.customer?.name ?? i.customer?.companyName ?? '\u2014',
          },
          {
            key: 'amount',
            header: 'Amount',
            className: 'font-mono',
            cell: (i: any) => formatCurrency(Number(i.total), i.currency),
          },
          { key: 'status', header: 'Status', cell: (i: any) => i.status },
          {
            key: 'issued',
            header: 'Issued',
            className: 'font-mono text-xs',
            cell: (i: any) => i.issueDate?.toISOString().slice(0, 10) ?? '\u2014',
          },
          {
            key: 'due',
            header: 'Due',
            className: 'font-mono text-xs',
            cell: (i: any) => i.dueDate?.toISOString().slice(0, 10) ?? '\u2014',
          },
        ]}
      />
    </div>
  );
}

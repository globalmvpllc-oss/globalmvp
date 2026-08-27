import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';
import { formatCurrency } from '@/lib/currencies';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.payments.listed');
  if (!context) return null;
  const { page, pageSize, skip, search } = context;

  const where = search
    ? {
        OR: [
          { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' as const } } },
          { company: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentDate: true,
        paymentMethod: true,
        company: { select: { name: true } },
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        expense: { select: { description: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">{total} payments across all companies</p>
      </div>

      <AdminListControls
        basePath="/admin/payments"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search invoice number or company"
      />

      <AdminTable
        rows={payments as any[]}
        emptyMessage="No payments match this search."
        columns={[
          { key: 'company', header: 'Company', cell: (p: any) => p.company?.name ?? '\u2014' },
          {
            key: 'against',
            header: 'Against',
            cell: (p: any) =>
              p.invoice?.invoiceNumber ?? p.expense?.description ?? '\u2014',
          },
          {
            key: 'customer',
            header: 'Customer',
            cell: (p: any) => p.invoice?.customer?.name ?? '\u2014',
          },
          {
            key: 'amount',
            header: 'Amount',
            className: 'font-mono',
            cell: (p: any) => formatCurrency(Number(p.amount), p.currency),
          },
          { key: 'method', header: 'Method', cell: (p: any) => p.paymentMethod ?? '\u2014' },
          {
            key: 'date',
            header: 'Date',
            className: 'font-mono text-xs',
            cell: (p: any) => p.paymentDate?.toISOString().slice(0, 10) ?? '\u2014',
          },
        ]}
      />
    </div>
  );
}

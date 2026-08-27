import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';
import { formatCurrency } from '@/lib/currencies';

/**
 * Subscriptions, read from our own table rather than from Polar.
 *
 * The rows are kept in step by the webhook, so a live API call would add
 * latency and a failure mode for information already at hand. Provider ids are
 * shown truncated: enough to match a record in Polar, not a value to copy about.
 */
export const dynamic = 'force-dynamic';

const shortId = (value: string | null | undefined) =>
  typeof value === 'string' && value.length > 12 ? `${value.slice(0, 8)}\u2026` : (value ?? '\u2014');

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.subscriptions.listed');
  if (!context) return null;
  const { page, pageSize, skip, search } = context;

  const where = search
    ? { company: { name: { contains: search, mode: 'insensitive' as const } } }
    : {};

  const [total, subscriptions] = await Promise.all([
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
        polarSubscriptionId: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">{total} paid subscriptions</p>
      </div>

      <AdminListControls
        basePath="/admin/subscriptions"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search company name"
      />

      <AdminTable
        rows={subscriptions as any[]}
        emptyMessage="No paid subscriptions yet."
        columns={[
          { key: 'company', header: 'Company', cell: (s: any) => s.company?.name ?? '\u2014' },
          { key: 'plan', header: 'Plan', cell: (s: any) => s.plan },
          { key: 'status', header: 'Status', cell: (s: any) => s.status },
          { key: 'interval', header: 'Interval', cell: (s: any) => s.interval },
          {
            key: 'amount',
            header: 'Amount',
            className: 'font-mono',
            cell: (s: any) => formatCurrency(Number(s.amount), s.currency),
          },
          {
            key: 'period',
            header: 'Current period',
            className: 'font-mono text-xs',
            cell: (s: any) =>
              `${s.currentPeriodStart.toISOString().slice(0, 10)} \u2192 ${s.currentPeriodEnd
                .toISOString()
                .slice(0, 10)}`,
          },
          {
            key: 'cancel',
            header: 'Cancelling',
            cell: (s: any) => (s.cancelAtPeriodEnd ? 'yes' : 'no'),
          },
          {
            key: 'polar',
            header: 'Polar id',
            className: 'font-mono text-xs text-muted-foreground',
            cell: (s: any) => shortId(s.polarSubscriptionId),
          },
        ]}
      />
    </div>
  );
}

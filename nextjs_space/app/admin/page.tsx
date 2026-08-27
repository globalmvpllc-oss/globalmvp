import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';

/**
 * Admin dashboard.
 *
 * Every figure is a live count from the database. Nothing here is illustrative:
 * a made-up number on an operations screen is worse than a missing one, because
 * it will be acted on.
 */
export const dynamic = 'force-dynamic';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboard() {
  // The layout already authorised this request; repeated here because a page
  // must not depend on a parent for its own access control.
  const check = await checkAdmin();
  if (!check.ok) return null;

  await recordAudit({ admin: check.admin, action: 'admin.dashboard.viewed' });

  const [
    users,
    companies,
    invoices,
    payments,
    income,
    expenses,
    customers,
    subscriptions,
    byPlan,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.incomeTransaction.count(),
    prisma.expenseTransaction.count(),
    prisma.customer.count(),
    prisma.subscription.count(),
    prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, email: true, name: true, createdAt: true },
    }),
  ]);

  const planCount = (plan: string) =>
    byPlan.find((row: { plan: string; _count: { _all: number } }) => row.plan === plan)?._count._all ?? 0;

  // Free is the absence of a subscription, so it is companies minus the rest
  // rather than a stored value.
  const paid = subscriptions;
  const free = Math.max(companies - paid, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">System overview</h1>
        <p className="text-muted-foreground">Live counts from the database.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Users" value={users} />
        <Metric label="Companies" value={companies} />
        <Metric label="Customers" value={customers} />
        <Metric label="Invoices" value={invoices} />
        <Metric label="Payments" value={payments} />
        <Metric label="Income records" value={income} />
        <Metric label="Expense records" value={expenses} />
        <Metric label="Active subscriptions" value={subscriptions} />
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="mb-3 font-medium">Plan distribution</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Free</p>
              <p className="font-mono text-lg font-bold">{free}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pro</p>
              <p className="font-mono text-lg font-bold">{planCount('pro')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Business</p>
              <p className="font-mono text-lg font-bold">{planCount('business')}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free is derived: companies without a subscription row. Trial companies count as
            Free here because no purchase exists.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="mb-3 font-medium">Newest accounts</p>
          <ul className="space-y-2 text-sm">
            {recentUsers.map((user: { id: string; email: string; name: string | null; createdAt: Date }) => (
              <li key={user.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{user.name ?? user.email}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {user.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
            {recentUsers.length === 0 ? (
              <li className="text-muted-foreground">No accounts yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

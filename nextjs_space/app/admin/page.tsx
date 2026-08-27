import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { formatCurrency } from '@/lib/currencies';

/**
 * Admin dashboard.
 *
 * Every figure is a live count from the database. Nothing here is illustrative:
 * a made-up number on an operations screen is worse than a missing one, because
 * it will be acted on. Revenue is grouped by currency rather than summed across
 * them — a single cross-currency total would not be money in any currency.
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

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminDashboard() {
  // The layout already authorised this request; repeated here because a page
  // must not depend on a parent for its own access control.
  const check = await checkAdmin();
  if (!check.ok) return null;

  await recordAudit({ admin: check.admin, action: 'admin.dashboard.viewed' });

  const [
    users,
    activeUsers,
    companies,
    invoices,
    payments,
    income,
    expenses,
    customers,
    subscriptions,
    byPlan,
    revenueByCurrency,
    recentUsers,
    recentCompanies,
    recentSubscriptions,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.company.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.incomeTransaction.count(),
    prisma.expenseTransaction.count(),
    prisma.customer.count(),
    prisma.subscription.count(),
    prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
    // Recurring billed per period, grouped by currency so nothing is summed
    // across currencies.
    prisma.subscription.groupBy({ by: ['currency'], _sum: { amount: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, email: true, name: true, isActive: true, createdAt: true },
    }),
    prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, name: true, createdAt: true, subscription: { select: { plan: true } } },
    }),
    prisma.subscription.findMany({
      orderBy: { currentPeriodStart: 'desc' },
      take: 6,
      select: { id: true, plan: true, status: true, interval: true, company: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, actorEmail: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);

  const planCount = (plan: string) =>
    byPlan.find((row: { plan: string; _count: { _all: number } }) => row.plan === plan)?._count._all ?? 0;

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
        <Metric label="Active users" value={activeUsers} />
        <Metric label="Companies" value={companies} />
        <Metric label="Customers" value={customers} />
        <Metric label="Invoices" value={invoices} />
        <Metric label="Payments" value={payments} />
        <Metric label="Income records" value={income} />
        <Metric label="Expense records" value={expenses} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              Free is derived: companies without a subscription row.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="mb-3 font-medium">Subscription revenue (billed per period)</p>
            {revenueByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid subscriptions yet.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {revenueByCurrency.map((row: { currency: string; _sum: { amount: unknown } }) => (
                  <div key={row.currency}>
                    <p className="text-xs text-muted-foreground">{row.currency}</p>
                    <p className="font-mono text-lg font-bold">
                      {formatCurrency(Number(row._sum.amount ?? 0), row.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Sum of active subscription amounts, grouped by currency. Never summed across currencies.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <p className="mb-3 font-medium">Newest accounts</p>
            <ul className="space-y-2 text-sm">
              {recentUsers.map((user: any) => (
                <li key={user.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/users/${user.id}`} className="truncate text-primary hover:underline">
                    {user.name ?? user.email}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {user.isActive ? '' : 'inactive · '}
                    {day(user.createdAt)}
                  </span>
                </li>
              ))}
              {recentUsers.length === 0 ? <li className="text-muted-foreground">No accounts yet.</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="mb-3 font-medium">Newest companies</p>
            <ul className="space-y-2 text-sm">
              {recentCompanies.map((company: any) => (
                <li key={company.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/companies/${company.id}`} className="truncate text-primary hover:underline">
                    {company.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {company.subscription?.plan ?? 'free'} · {day(company.createdAt)}
                  </span>
                </li>
              ))}
              {recentCompanies.length === 0 ? <li className="text-muted-foreground">No companies yet.</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="mb-3 font-medium">Recent subscriptions</p>
            <ul className="space-y-2 text-sm">
              {recentSubscriptions.map((sub: any) => (
                <li key={sub.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/subscriptions/${sub.id}`} className="truncate text-primary hover:underline">
                    {sub.company?.name ?? '—'}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {sub.plan}/{sub.interval} · {sub.status}
                  </span>
                </li>
              ))}
              {recentSubscriptions.length === 0 ? (
                <li className="text-muted-foreground">No paid subscriptions yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">Recent admin activity</p>
              <Link href="/admin/logs" className="text-xs text-primary hover:underline">
                All logs →
              </Link>
            </div>
            <ul className="space-y-2 text-xs">
              {recentAudit.map((entry: any) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    <span className="font-mono">{entry.action}</span>{' '}
                    <span className="text-muted-foreground">{entry.actorEmail}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{day(entry.createdAt)}</span>
                </li>
              ))}
              {recentAudit.length === 0 ? <li className="text-muted-foreground">No activity yet.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

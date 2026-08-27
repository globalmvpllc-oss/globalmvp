import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { formatCurrency } from '@/lib/currencies';
import { AdminBackLink, DetailCard, FieldGrid, Field, DetailTable } from '@/components/admin-detail';
import { MemberActions, GrantedPlanForm } from '@/components/admin-actions';

/**
 * A single company, read-only.
 *
 * Everything is scoped to this company id and comes straight from the tables the
 * product already writes. No control here can change a plan, a balance or a
 * membership — the panel reviews, it does not rewrite. Plan state in particular
 * stays owned by Polar and its webhook.
 */
export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AdminCompanyDetailPage({ params }: { params: { id: string } }) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      legalName: true,
      country: true,
      defaultCurrency: true,
      timezone: true,
      email: true,
      phone: true,
      website: true,
      taxNumber: true,
      address: true,
      city: true,
      createdAt: true,
      grantedPlan: true,
      grantedPlanUntil: true,
      grantedPlanReason: true,
      subscription: {
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
          polarCustomerId: true,
        },
      },
      members: {
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      _count: {
        select: {
          members: true,
          invoices: true,
          payments: true,
          customers: true,
          vendors: true,
          incomeTransactions: true,
          expenseTransactions: true,
        },
      },
      invoices: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          currency: true,
          dueDate: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      payments: {
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentDate: true,
          paymentMethod: true,
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 10,
      },
    },
  });

  if (!company) notFound();

  await recordAudit({
    admin: check.admin,
    action: 'admin.company.viewed',
    entityType: 'company',
    entityId: company.id,
    companyId: company.id,
  });

  const sub = company.subscription;

  return (
    <div className="space-y-4">
      <AdminBackLink href="/admin/companies" label="Back to companies" />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{company.name}</h1>
        <p className="text-muted-foreground">{company.legalName || 'Company detail'}</p>
      </div>

      <DetailCard title="Overview">
        <FieldGrid>
          <Field label="Country" value={company.country} />
          <Field label="Default currency" value={company.defaultCurrency} />
          <Field label="Timezone" value={company.timezone} />
          <Field label="Email" value={company.email} />
          <Field label="Phone" value={company.phone} />
          <Field label="Website" value={company.website} />
          <Field label="Tax number" value={company.taxNumber} />
          <Field label="Location" value={[company.address, company.city].filter(Boolean).join(', ')} />
          <Field label="Created" value={day(company.createdAt)} mono />
        </FieldGrid>
      </DetailCard>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {[
          ['Users', company._count.members],
          ['Invoices', company._count.invoices],
          ['Payments', company._count.payments],
          ['Customers', company._count.customers],
          ['Vendors', company._count.vendors],
          ['Income', company._count.incomeTransactions],
          ['Expenses', company._count.expenseTransactions],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono text-lg font-bold">{value as number}</p>
          </div>
        ))}
      </div>

      <DetailCard title="Subscription">
        {sub ? (
          <FieldGrid>
            <Field label="Plan" value={sub.plan} />
            <Field label="Status" value={sub.status} />
            <Field label="Interval" value={sub.interval} />
            <Field label="Amount" value={formatCurrency(Number(sub.amount), sub.currency)} mono />
            <Field label="Current period" value={`${day(sub.currentPeriodStart)} → ${day(sub.currentPeriodEnd)}`} mono />
            <Field label="Cancelling at period end" value={sub.cancelAtPeriodEnd ? 'yes' : 'no'} />
            <Field label="Polar subscription id" value={sub.polarSubscriptionId} mono />
            <Field label="Polar customer id" value={sub.polarCustomerId} mono />
            <Field
              label="Manage in Polar"
              value={
                <a
                  href="https://polar.sh/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Polar dashboard
                </a>
              }
            />
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground">
            On the Free plan — no Polar subscription. Plans are set through checkout and Polar&apos;s
            webhook, never from here.
          </p>
        )}
      </DetailCard>

      <DetailCard title="Granted plan (admin)">
        <p className="mb-3 text-sm">
          <span className="text-xs text-muted-foreground">Plan source: </span>
          <span className="font-medium">
            {sub
              ? 'Polar subscription'
              : company.grantedPlan &&
                  (company.grantedPlanUntil === null || company.grantedPlanUntil.getTime() > Date.now())
                ? `Admin grant (${company.grantedPlan})`
                : 'None — Free or automatic trial'}
          </span>
          {company.grantedPlanReason ? (
            <span className="text-xs text-muted-foreground"> · reason: {company.grantedPlanReason}</span>
          ) : null}
        </p>
        <GrantedPlanForm
          companyId={company.id}
          grantedPlan={company.grantedPlan}
          grantedPlanReason={company.grantedPlanReason}
          grantedPlanUntil={company.grantedPlanUntil ? company.grantedPlanUntil.toISOString().slice(0, 10) : ''}
        />
      </DetailCard>

      <DetailCard title={`Members (${company.members.length})`}>
        <DetailTable
          rows={company.members as any[]}
          emptyMessage="No members."
          columns={[
            {
              key: 'user',
              header: 'User',
              cell: (m: any) => (
                <Link href={`/admin/users/${m.user?.id}`} className="text-primary hover:underline">
                  {m.user?.name || m.user?.email || '—'}
                </Link>
              ),
            },
            { key: 'email', header: 'Email', cell: (m: any) => m.user?.email ?? '—' },
            { key: 'since', header: 'Since', className: 'font-mono text-xs', cell: (m: any) => day(m.createdAt) },
            {
              key: 'manage',
              header: 'Role & actions',
              cell: (m: any) => <MemberActions memberId={m.id} role={m.role} />,
            },
          ]}
        />
      </DetailCard>

      <DetailCard title="Recent invoices">
        <DetailTable
          rows={company.invoices as any[]}
          emptyMessage="No invoices."
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
            { key: 'customer', header: 'Customer', cell: (i: any) => i.customer?.name ?? '—' },
            { key: 'amount', header: 'Amount', className: 'font-mono', cell: (i: any) => formatCurrency(Number(i.total), i.currency) },
            { key: 'status', header: 'Status', cell: (i: any) => i.status },
            { key: 'due', header: 'Due', className: 'font-mono text-xs', cell: (i: any) => day(i.dueDate) },
          ]}
        />
      </DetailCard>

      <DetailCard title="Recent payments">
        <DetailTable
          rows={company.payments as any[]}
          emptyMessage="No payments."
          columns={[
            {
              key: 'ref',
              header: 'Against',
              cell: (p: any) => (
                <Link href={`/admin/payments/${p.id}`} className="text-primary hover:underline">
                  {p.invoice?.invoiceNumber ?? 'Payment'}
                </Link>
              ),
            },
            { key: 'amount', header: 'Amount', className: 'font-mono', cell: (p: any) => formatCurrency(Number(p.amount), p.currency) },
            { key: 'method', header: 'Method', cell: (p: any) => p.paymentMethod ?? '—' },
            { key: 'date', header: 'Date', className: 'font-mono text-xs', cell: (p: any) => day(p.paymentDate) },
          ]}
        />
      </DetailCard>
    </div>
  );
}

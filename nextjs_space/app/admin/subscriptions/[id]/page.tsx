import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { formatCurrency } from '@/lib/currencies';
import { AdminBackLink, DetailCard, FieldGrid, Field } from '@/components/admin-detail';

/**
 * A single subscription, read-only and mirrored from Polar by the webhook.
 *
 * There is deliberately no control to change the plan or status: Polar is the
 * source of truth, and the only writer of this row is the webhook. Management
 * happens in Polar's dashboard, linked below.
 */
export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AdminSubscriptionDetailPage({ params }: { params: { id: string } }) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const sub = await prisma.subscription.findUnique({
    where: { id: params.id },
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
      canceledAt: true,
      trialEndsAt: true,
      lastEventAt: true,
      createdAt: true,
      polarSubscriptionId: true,
      polarCustomerId: true,
      polarProductId: true,
      polarPriceId: true,
      company: { select: { id: true, name: true } },
    },
  });

  if (!sub) notFound();

  return (
    <div className="space-y-4">
      <AdminBackLink href="/admin/subscriptions" label="Back to subscriptions" />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight capitalize">
          {sub.plan} · {sub.interval}
        </h1>
        <p className="text-muted-foreground">{sub.company?.name ?? 'Subscription'}</p>
      </div>

      <DetailCard title="Plan">
        <FieldGrid>
          <Field
            label="Company"
            value={
              <Link href={`/admin/companies/${sub.company?.id}`} className="text-primary hover:underline">
                {sub.company?.name ?? '—'}
              </Link>
            }
          />
          <Field label="Plan" value={sub.plan} />
          <Field label="Status" value={sub.status} />
          <Field label="Interval" value={sub.interval} />
          <Field label="Amount" value={formatCurrency(Number(sub.amount), sub.currency)} mono />
          <Field label="Current period" value={`${day(sub.currentPeriodStart)} → ${day(sub.currentPeriodEnd)}`} mono />
          <Field label="Cancelling at period end" value={sub.cancelAtPeriodEnd ? 'yes' : 'no'} />
          <Field label="Canceled at" value={sub.canceledAt ? day(sub.canceledAt) : null} mono />
          <Field label="Trial ends" value={sub.trialEndsAt ? day(sub.trialEndsAt) : null} mono />
          <Field label="Last Polar event" value={sub.lastEventAt ? day(sub.lastEventAt) : null} mono />
        </FieldGrid>
      </DetailCard>

      <DetailCard title="Polar">
        <FieldGrid>
          <Field label="Subscription id" value={sub.polarSubscriptionId} mono />
          <Field label="Customer id" value={sub.polarCustomerId} mono />
          <Field label="Product id" value={sub.polarProductId} mono />
          <Field label="Price id" value={sub.polarPriceId} mono />
        </FieldGrid>
        <p className="mt-3 text-sm">
          <a
            href="https://polar.sh/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Manage this subscription in the Polar dashboard →
          </a>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Polar is the source of truth for plan and status. This row is updated only by Polar&apos;s
          webhook; it cannot be changed from the admin panel.
        </p>
      </DetailCard>
    </div>
  );
}

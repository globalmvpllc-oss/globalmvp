export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getPolarClient, BillingNotConfiguredError, describePolarError } from '@/lib/billing/polar';
import { isPaidPlan, planForConfiguredId, productIdFor } from '@/lib/billing/plans';
import {
  classifyPlanChange,
  estimateUpgradeCharge,
  findPlanChangeOrder,
  planChangeBlocker,
  prorationBehaviorFor,
} from '@/lib/billing/plan-change';
import { mapSubscriptionEvent } from '@/lib/billing/webhook-mapping';
import { applySubscriptionRecord, type SubscriptionWriter } from '@/lib/billing/apply-subscription';
import { type TxClient } from '@/lib/payment-calc';

/**
 * Moves the signed-in company's existing subscription to another paid plan.
 *
 * Body: `{ plan: 'pro' | 'business', confirm?: boolean }`.
 *
 *   - Without `confirm` it changes nothing and answers with what would happen:
 *     the direction, and for an upgrade an estimate of today's charge.
 *   - With `confirm: true` it calls Polar's subscription update. Upgrades are
 *     applied now and the prorated difference is charged now (`invoice`);
 *     downgrades are scheduled for the end of the period (`next_period`).
 *
 * The client names a plan and nothing else. The subscription is the company's
 * own row, found by the session's companyId; the Polar product id comes from
 * the environment; the billing interval stays whatever the subscription is on.
 */

const BLOCKED_MESSAGE: Record<string, string> = {
  not_active: 'Your subscription is not active, so its plan cannot be changed.',
  cancel_scheduled:
    'Your subscription is set to cancel. Resume it from "Manage subscription" before changing plan.',
};

export async function POST(request: Request) {
  const requestedAt = new Date();
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const plan = body?.plan;
    const confirm = body?.confirm === true;

    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: 'Choose one of the available plans.' }, { status: 400 });
    }

    const stored = await prisma.subscription.findUnique({
      where: { companyId },
      select: { polarSubscriptionId: true, status: true, cancelAtPeriodEnd: true },
    });
    if (!stored) {
      // No subscription to move: a first purchase goes through checkout.
      return NextResponse.json({ error: 'There is no subscription to change yet.' }, { status: 409 });
    }

    const blocker = planChangeBlocker(stored);
    if (blocker) return NextResponse.json({ error: BLOCKED_MESSAGE[blocker] }, { status: 409 });

    const polar = getPolarClient();

    // Read the live subscription rather than trusting the stored row: the plan
    // a customer is on is whatever Polar is billing, and the row can lag a
    // webhook behind.
    const live = await polar.subscriptions.get({ id: stored.polarSubscriptionId });
    if (live.metadata?.companyId !== companyId) {
      console.error('[billing:change-plan] subscription does not belong to this company');
      return NextResponse.json({ error: 'There is no subscription to change yet.' }, { status: 409 });
    }
    const liveBlocker = planChangeBlocker({ status: live.status, cancelAtPeriodEnd: live.cancelAtPeriodEnd });
    if (liveBlocker) return NextResponse.json({ error: BLOCKED_MESSAGE[liveBlocker] }, { status: 409 });

    const current = planForConfiguredId(live.productId);
    if (!current) {
      console.error('[billing:change-plan] live product is not a configured plan');
      return NextResponse.json(
        { error: 'Your current plan cannot be changed here. Please contact support.' },
        { status: 409 }
      );
    }

    const direction = classifyPlanChange(current.plan, plan);
    if (direction === 'same') {
      return NextResponse.json({ error: 'You are already on this plan.' }, { status: 409 });
    }

    // Same interval as today: a monthly customer moves to the monthly price of
    // the other plan. Changing interval is a different decision, not this one.
    const targetProductId = productIdFor(plan, current.interval);
    if (!targetProductId) {
      return NextResponse.json(
        { error: 'Billing is not available yet. Please try again later.' },
        { status: 503 }
      );
    }

    const currency = String(live.currency ?? '').toUpperCase();
    const periodEnd = new Date(live.currentPeriodEnd);

    if (!confirm) {
      let estimate: number | null = null;
      if (direction === 'upgrade') {
        const product = await polar.products.get({ id: targetProductId });
        const price = (product.prices as Array<Record<string, unknown>>).find(
          (p) => p?.amountType === 'fixed' && !p?.isArchived && typeof p?.priceAmount === 'number'
        );
        const minor =
          price && String(price.priceCurrency ?? '').toUpperCase() === currency
            ? estimateUpgradeCharge({
                currentAmountMinor: live.amount,
                targetAmountMinor: price.priceAmount as number,
                periodStart: new Date(live.currentPeriodStart),
                periodEnd,
              })
            : null;
        estimate = minor === null ? null : minor / 100;
      }
      return NextResponse.json({
        direction,
        plan,
        interval: current.interval,
        currency,
        estimate,
        effectiveAt: direction === 'upgrade' ? requestedAt.toISOString() : periodEnd.toISOString(),
      });
    }

    let updated;
    try {
      updated = await polar.subscriptions.update({
        id: stored.polarSubscriptionId,
        subscriptionUpdate: {
          productId: targetProductId,
          prorationBehavior: prorationBehaviorFor(direction),
        },
      });
    } catch (updateError) {
      // Polar documents that a failed payment returns an error and leaves the
      // subscription unchanged, so this is safe to report as "nothing changed".
      console.error('[billing:change-plan] Polar rejected the update:', describePolarError(updateError));
      return NextResponse.json(
        {
          error:
            'The plan could not be changed and nothing was charged. Check your payment method under "Manage subscription" and try again.',
        },
        { status: 402 }
      );
    }

    if (direction === 'downgrade') {
      return NextResponse.json({
        status: 'scheduled',
        plan,
        effectiveAt: periodEnd.toISOString(),
      });
    }

    // Upgrade: apply what Polar returned so the new plan shows at once. The
    // subscription.updated webhook carries the same state to the same row.
    const mapped = mapSubscriptionEvent('subscription.updated', updated);
    if (mapped.ok) {
      await prisma.$transaction(async (tx: TxClient) => {
        await applySubscriptionRecord(tx as unknown as SubscriptionWriter, mapped.record);
      });
    } else {
      console.error('[billing:change-plan] could not map updated subscription', { reason: mapped.reason });
    }

    // What Polar actually charged, read back from the order it raised. Best
    // effort: the change has already succeeded, so a failure here only means
    // the amount is not shown.
    let charged: { orderId: string; amount: number; currency: string } | null = null;
    try {
      const page = await polar.orders.list({
        subscriptionId: stored.polarSubscriptionId,
        sorting: ['-created_at'],
        limit: 5,
      });
      const order = findPlanChangeOrder(page.result.items, requestedAt);
      if (order) {
        charged = { orderId: order.id, amount: order.totalAmount / 100, currency: order.currency.toUpperCase() };
      }
    } catch (orderError) {
      console.error('[billing:change-plan] could not read the upgrade order:', describePolarError(orderError));
    }

    return NextResponse.json({ status: 'upgraded', plan, charged });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      console.error('[billing:change-plan]', error.message);
      return NextResponse.json(
        { error: 'Billing is not available yet. Please try again later.' },
        { status: 503 }
      );
    }
    console.error('[billing:change-plan] failed:', describePolarError(error));
    return handleApiError('billing:change-plan', error, {
      fallbackMessage: 'Could not change your plan. Please try again.',
    });
  }
}

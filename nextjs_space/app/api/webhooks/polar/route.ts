export const dynamic = 'force-dynamic';
// Node runtime, not Edge: signature verification needs Node's crypto.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { prisma } from '@/lib/db';
import { getWebhookSecret, BillingNotConfiguredError } from '@/lib/billing/polar';
import { mapSubscriptionEvent, shouldApplyEvent, isHandledEventType } from '@/lib/billing/webhook-mapping';
import { type TxClient } from '@/lib/payment-calc';

/**
 * Polar webhook receiver.
 *
 * This is the only way a subscription is written. Checkout returns a URL and
 * nothing else; the row appears when Polar says the money moved. That keeps a
 * browser from ever asserting its own plan.
 *
 * Reached without a session — middleware exempts /api/webhooks/ for exactly
 * this reason — so the signature is the authentication. There is no fallback
 * path that accepts an unsigned request.
 */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = getWebhookSecret();
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      // Never accept an unverifiable delivery just because the secret is
      // missing. 503 tells Polar to retry once the deployment is configured.
      console.error('[webhooks:polar]', error.message);
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }
    throw error;
  }

  // The raw body is required: re-serialising parsed JSON changes the bytes and
  // invalidates the signature.
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: { type: string; data: unknown };
  try {
    event = validateEvent(body, headers, secret) as { type: string; data: unknown };
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // The body is not logged: an unverified payload is untrusted input.
      console.warn('[webhooks:polar] signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.error('[webhooks:polar] could not parse event');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Events this application does not act on are acknowledged, not retried.
  if (!isHandledEventType(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  const mapped = mapSubscriptionEvent(event.type, event.data);
  if (!mapped.ok) {
    // 200 on purpose: a payload we cannot attribute will not become valid on
    // retry, so asking Polar to redeliver it forever helps no one. The reason
    // is logged instead.
    console.error('[webhooks:polar] ignored event', { type: event.type, reason: mapped.reason });
    return NextResponse.json({ received: true, handled: false });
  }

  const record = mapped.record;

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      const company = await tx.company.findUnique({
        where: { id: record.companyId },
        select: { id: true },
      });
      if (!company) {
        console.error('[webhooks:polar] unknown company', { type: event.type });
        return;
      }

      const existing = await tx.subscription.findUnique({
        where: { polarSubscriptionId: record.polarSubscriptionId },
        select: { id: true, lastEventAt: true },
      });

      // Out-of-order delivery: an older event must not overwrite newer state.
      if (existing && !shouldApplyEvent(existing.lastEventAt, record.lastEventAt)) {
        console.warn('[webhooks:polar] stale event ignored', { type: event.type });
        return;
      }

      // Upsert on the unique provider id: a redelivered event updates the same
      // row instead of inserting a second one.
      await tx.subscription.upsert({
        where: { polarSubscriptionId: record.polarSubscriptionId },
        create: record,
        update: {
          // companyId is intentionally not updated: a subscription does not
          // move between companies, and rewriting it would silently transfer a
          // paid plan.
          polarCustomerId: record.polarCustomerId,
          polarProductId: record.polarProductId,
          polarPriceId: record.polarPriceId,
          plan: record.plan,
          status: record.status,
          interval: record.interval,
          currency: record.currency,
          amount: record.amount,
          currentPeriodStart: record.currentPeriodStart,
          currentPeriodEnd: record.currentPeriodEnd,
          cancelAtPeriodEnd: record.cancelAtPeriodEnd,
          canceledAt: record.canceledAt,
          trialEndsAt: record.trialEndsAt,
          lastEventAt: record.lastEventAt,
        },
      });
    });

    return NextResponse.json({ received: true, handled: true });
  } catch (error) {
    // A genuine failure — the database was unreachable, say — is worth a retry,
    // so this is the one path that returns 5xx. No provider detail is echoed.
    console.error('[webhooks:polar] processing failed', {
      type: event.type,
      code: (error as { code?: string })?.code,
    });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

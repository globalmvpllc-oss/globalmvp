import { describe, it, expect } from 'vitest';
import {
  mapSubscriptionEvent,
  shouldApplyEvent,
  isHandledEventType,
  mapStatus,
  resolveStatus,
  HANDLED_EVENT_TYPES,
} from '@/lib/billing/webhook-mapping';
import { hasPaidAccess, currentPlan } from '@/lib/billing/access';

/**
 * Webhook interpretation.
 *
 * The webhook is the only writer of subscription rows, so these cover the ways
 * a delivery can be wrong: an unknown price, an unattributable payload, a
 * redelivery, and one arriving out of order.
 *
 * No real Polar ids or secrets appear here — the price map is passed in.
 */

const ENV = {
  POLAR_PRO_PRICE_MONTHLY: 'price-pro-monthly',
  POLAR_PRO_PRICE_YEARLY: 'price-pro-yearly',
  POLAR_BUSINESS_PRICE_MONTHLY: 'price-business-monthly',
  POLAR_BUSINESS_PRICE_YEARLY: 'price-business-yearly',
};

const RECEIVED = new Date('2026-06-15T12:00:00.000Z');

/** A payload shaped like Polar's subscription object. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    customerId: 'cus-1',
    productId: 'prod-1',
    priceId: 'price-pro-monthly',
    status: 'active',
    currency: 'usd',
    amount: 2900, // minor units
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    modifiedAt: '2026-06-15T11:00:00.000Z',
    metadata: { companyId: 'company-1' },
    ...overrides,
  };
}

describe('event allowlist', () => {
  it.each(HANDLED_EVENT_TYPES)('handles %s', (type) => {
    expect(isHandledEventType(type)).toBe(true);
  });

  it.each(['order.created', 'customer.created', 'checkout.updated', '', null])(
    'ignores %s',
    (type) => {
      expect(isHandledEventType(type)).toBe(false);
    }
  );
});

describe('status mapping', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['revoked', 'revoked'],
    ['incomplete', 'incomplete'],
    ['incomplete_expired', 'revoked'],
    ['unpaid', 'past_due'],
  ])('maps %s to %s', (polar, expected) => {
    expect(mapStatus(polar)).toBe(expected);
  });

  it.each(['something_new', '', null, 42])('returns null for %s', (value) => {
    // An unmapped status must be visible, not stored and silently compared.
    expect(mapStatus(value)).toBeNull();
  });

  it('lets a revoked event win over a stale active status', () => {
    expect(resolveStatus('subscription.revoked', 'active')).toBe('revoked');
  });

  it('lets a past_due event win over a stale status', () => {
    expect(resolveStatus('subscription.past_due', 'active')).toBe('past_due');
  });

  it('defers to the status field for other events', () => {
    expect(resolveStatus('subscription.updated', 'trialing')).toBe('trialing');
  });
});

describe('subscription.created mapping', () => {
  it('produces a complete record', () => {
    const result = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.record.companyId).toBe('company-1');
    expect(result.record.polarSubscriptionId).toBe('sub-1');
    expect(result.record.polarCustomerId).toBe('cus-1');
    expect(result.record.plan).toBe('pro');
    expect(result.record.interval).toBe('month');
    expect(result.record.status).toBe('active');
    expect(result.record.currency).toBe('USD');
  });

  it('converts minor units to a decimal amount', () => {
    const result = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.amount).toBe(29);
  });

  it('derives the plan from the price charged, not from the payload', () => {
    // A payload claiming a plan must not override the price mapping.
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price-business-yearly', plan: 'pro' }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.plan).toBe('business');
    expect(result.record.interval).toBe('year');
  });

  it('reads the customer and product from nested objects too', () => {
    const nested = payload({
      customerId: undefined,
      productId: undefined,
      priceId: undefined,
      customer: { id: 'cus-nested' },
      product: { id: 'prod-nested' },
      price: { id: 'price-pro-yearly' },
    });
    const result = mapSubscriptionEvent('subscription.created', nested, ENV, RECEIVED);
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.polarCustomerId).toBe('cus-nested');
    expect(result.record.polarProductId).toBe('prod-nested');
  });
});

describe('payloads that must be rejected', () => {
  it('rejects an unrecognised price', () => {
    // Recording someone on a plan they did not buy is worse than dropping it.
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price-not-ours' }),
      ENV,
      RECEIVED
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unrecognised price');
  });

  it('rejects a payload with no companyId in metadata', () => {
    // companyId is set by our checkout. Without it the subscription cannot be
    // attributed to anyone, and guessing would assign someone else's plan.
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ metadata: {} }),
      ENV,
      RECEIVED
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('companyId');
  });

  it.each([
    ['id', { id: undefined }],
    ['customer', { customerId: undefined, customer: undefined }],
    ['product', { productId: undefined, product: undefined }],
    ['currency', { currency: undefined }],
    ['amount', { amount: undefined }],
  ])('rejects a payload missing the %s', (_name, override) => {
    const result = mapSubscriptionEvent('subscription.created', payload(override), ENV, RECEIVED);
    expect(result.ok).toBe(false);
  });

  it('rejects an unparseable billing period', () => {
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ currentPeriodEnd: 'not-a-date' }),
      ENV,
      RECEIVED
    );
    expect(result.ok).toBe(false);
  });

  it.each([null, undefined, 'a string', 42])('rejects non-object data (%s)', (data) => {
    expect(mapSubscriptionEvent('subscription.created', data, ENV, RECEIVED).ok).toBe(false);
  });

  it('rejects an event type it does not handle', () => {
    expect(mapSubscriptionEvent('order.created', payload(), ENV, RECEIVED).ok).toBe(false);
  });
});

describe('cancellation mapping', () => {
  it('records the cancellation while access continues', () => {
    const result = mapSubscriptionEvent(
      'subscription.canceled',
      payload({ status: 'canceled', cancelAtPeriodEnd: true, canceledAt: '2026-06-10T00:00:00.000Z' }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.status).toBe('canceled');
    expect(result.record.cancelAtPeriodEnd).toBe(true);
    expect(result.record.canceledAt).toBeInstanceOf(Date);

    // The paid period still runs, so entitlement survives the cancellation.
    expect(hasPaidAccess(result.record, RECEIVED)).toBe(true);
  });

  it('clears the cancellation when it is undone', () => {
    const result = mapSubscriptionEvent(
      'subscription.uncanceled',
      payload({ cancelAtPeriodEnd: true, canceledAt: '2026-06-10T00:00:00.000Z' }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.cancelAtPeriodEnd).toBe(false);
    expect(result.record.canceledAt).toBeNull();
  });

  it('withdraws access on revocation', () => {
    const result = mapSubscriptionEvent(
      'subscription.revoked',
      payload({ status: 'active' }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.status).toBe('revoked');
    expect(hasPaidAccess(result.record, RECEIVED)).toBe(false);
    expect(currentPlan(result.record, RECEIVED)).toBe('free');
  });

  it('keeps access while past_due, matching the entitlement rule', () => {
    const result = mapSubscriptionEvent('subscription.past_due', payload(), ENV, RECEIVED);
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.status).toBe('past_due');
    expect(hasPaidAccess(result.record, RECEIVED)).toBe(true);
  });
});

describe('idempotency and ordering', () => {
  it('produces an identical record for a redelivered event', () => {
    const first = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    const second = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    expect(first).toEqual(second);
  });

  it('keys on the provider id, so an upsert hits the same row', () => {
    const a = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    const b = mapSubscriptionEvent('subscription.updated', payload({ status: 'trialing' }), ENV, RECEIVED);
    if (!a.ok || !b.ok) throw new Error('expected mapping to succeed');
    expect(a.record.polarSubscriptionId).toBe(b.record.polarSubscriptionId);
  });

  it('applies an event when nothing is stored yet', () => {
    expect(shouldApplyEvent(null, RECEIVED)).toBe(true);
    expect(shouldApplyEvent(undefined, RECEIVED)).toBe(true);
  });

  it('applies a newer event', () => {
    const older = new Date(RECEIVED.getTime() - 60_000);
    expect(shouldApplyEvent(older, RECEIVED)).toBe(true);
  });

  it('applies a redelivery of the same event', () => {
    // Same timestamp: the upsert is idempotent, so re-applying is harmless.
    expect(shouldApplyEvent(RECEIVED, RECEIVED)).toBe(true);
  });

  it('ignores an event older than what is stored', () => {
    // Otherwise a delayed "updated" could overwrite a later "revoked" and hand
    // back access that was withdrawn.
    const stale = new Date(RECEIVED.getTime() - 60_000);
    expect(shouldApplyEvent(RECEIVED, stale)).toBe(false);
  });

  it('uses the provider timestamp when present, not arrival time', () => {
    const result = mapSubscriptionEvent(
      'subscription.updated',
      payload({ modifiedAt: '2026-06-14T00:00:00.000Z' }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.lastEventAt.toISOString()).toBe('2026-06-14T00:00:00.000Z');
  });

  it('falls back to arrival time when the provider omits one', () => {
    const result = mapSubscriptionEvent(
      'subscription.updated',
      payload({ modifiedAt: undefined }),
      ENV,
      RECEIVED
    );
    if (!result.ok) throw new Error('expected mapping to succeed');
    expect(result.record.lastEventAt).toEqual(RECEIVED);
  });
});

describe('nothing sensitive travels in a mapped record', () => {
  it('carries no token, secret or raw payload', () => {
    const result = mapSubscriptionEvent('subscription.created', payload(), ENV, RECEIVED);
    if (!result.ok) throw new Error('expected mapping to succeed');

    const serialised = JSON.stringify(result.record).toLowerCase();
    for (const forbidden of ['token', 'secret', 'authorization', 'apikey']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('reports a failure reason without echoing the payload', () => {
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price-not-ours', metadata: { companyId: 'company-1', card: '4242' } }),
      ENV,
      RECEIVED
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain('4242');
  });
});

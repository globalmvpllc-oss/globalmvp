import { describe, it, expect } from 'vitest';
import { applySubscriptionRecord, type SubscriptionWriter } from '@/lib/billing/apply-subscription';
import { mapSubscriptionEvent, type SubscriptionRecord } from '@/lib/billing/webhook-mapping';

/**
 * The single write path for subscription rows, shared by the Polar webhook and
 * the plan-change route. An in-memory stand-in for the two tables is enough to
 * show the guarantees: one row per Polar subscription, stale events ignored,
 * the company never rewritten.
 */

const ENV = {
  POLAR_PRO_PRICE_MONTHLY: 'prod-pro-m',
  POLAR_PRO_PRICE_YEARLY: 'prod-pro-y',
  POLAR_BUSINESS_PRICE_MONTHLY: 'prod-biz-m',
  POLAR_BUSINESS_PRICE_YEARLY: 'prod-biz-y',
};

function polarSubscription(over: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    customerId: 'cus-1',
    productId: 'prod-pro-m',
    prices: [{ id: 'price-x' }],
    status: 'active',
    currency: 'usd',
    amount: 999,
    currentPeriodStart: '2026-11-01T00:00:00.000Z',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    modifiedAt: '2026-11-10T00:00:00.000Z',
    metadata: { companyId: 'company-1' },
    ...over,
  };
}

function record(over: Record<string, unknown> = {}): SubscriptionRecord {
  const mapped = mapSubscriptionEvent('subscription.updated', polarSubscription(over), ENV);
  if (!mapped.ok) throw new Error(mapped.reason);
  return mapped.record;
}

function fakeDb(companies = ['company-1']) {
  const rows = new Map<string, SubscriptionRecord>();
  const db: SubscriptionWriter = {
    company: {
      findUnique: async ({ where }) => (companies.includes(where.id) ? { id: where.id } : null),
    },
    subscription: {
      findUnique: async ({ where }) => {
        const row = rows.get(where.polarSubscriptionId);
        return row ? { id: row.polarSubscriptionId, lastEventAt: row.lastEventAt } : null;
      },
      upsert: async ({ where, create, update }) => {
        const existing = rows.get(where.polarSubscriptionId);
        rows.set(where.polarSubscriptionId, existing ? { ...existing, ...update } : create);
        return null;
      },
    },
  };
  return { db, rows };
}

describe('applying a subscription record', () => {
  it('moves the plan on the same row after an upgrade (no second row)', async () => {
    const { db, rows } = fakeDb();
    await applySubscriptionRecord(db, record());
    const outcome = await applySubscriptionRecord(
      db,
      record({ productId: 'prod-biz-m', amount: 2499, modifiedAt: '2026-11-16T00:00:00.000Z' })
    );
    expect(outcome).toBe('applied');
    expect(rows.size).toBe(1);
    expect(rows.get('sub-1')?.plan).toBe('business');
    expect(rows.get('sub-1')?.amount).toBe(24.99);
  });

  it('treats the route write and the webhook redelivery of the same state as one', async () => {
    const { db, rows } = fakeDb();
    const upgraded = record({ productId: 'prod-biz-m', modifiedAt: '2026-11-16T00:00:00.000Z' });
    expect(await applySubscriptionRecord(db, upgraded)).toBe('applied');
    expect(await applySubscriptionRecord(db, upgraded)).toBe('applied');
    expect(rows.size).toBe(1);
    expect(rows.get('sub-1')?.plan).toBe('business');
  });

  it('ignores a delayed older event, so the plan cannot roll back', async () => {
    const { db, rows } = fakeDb();
    await applySubscriptionRecord(db, record({ productId: 'prod-biz-m', modifiedAt: '2026-11-16T00:00:00.000Z' }));
    const outcome = await applySubscriptionRecord(db, record({ modifiedAt: '2026-11-10T00:00:00.000Z' }));
    expect(outcome).toBe('stale');
    expect(rows.get('sub-1')?.plan).toBe('business');
  });

  it('never moves a subscription to another company', async () => {
    const { db, rows } = fakeDb(['company-1', 'company-2']);
    await applySubscriptionRecord(db, record());
    await applySubscriptionRecord(
      db,
      record({ metadata: { companyId: 'company-2' }, modifiedAt: '2026-11-20T00:00:00.000Z' })
    );
    expect(rows.get('sub-1')?.companyId).toBe('company-1');
  });

  it('writes nothing for an unknown company', async () => {
    const { db, rows } = fakeDb([]);
    expect(await applySubscriptionRecord(db, record())).toBe('unknown_company');
    expect(rows.size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  classifyPlanChange,
  prorationBehaviorFor,
  planChangeBlocker,
  estimateUpgradeCharge,
  findPlanChangeOrder,
} from '@/lib/billing/plan-change';

/**
 * Moving an existing subscription between paid plans.
 * No Polar calls here: these are the rules the change-plan route applies.
 */

describe('direction of a plan change', () => {
  it('Pro to Business is an upgrade', () => {
    expect(classifyPlanChange('pro', 'business')).toBe('upgrade');
  });
  it('Business to Pro is a downgrade', () => {
    expect(classifyPlanChange('business', 'pro')).toBe('downgrade');
  });
  it('the same plan is not a change', () => {
    expect(classifyPlanChange('pro', 'pro')).toBe('same');
    expect(classifyPlanChange('business', 'business')).toBe('same');
  });
});

describe('proration behaviour sent to Polar', () => {
  it('charges an upgrade now (invoice)', () => {
    expect(prorationBehaviorFor('upgrade')).toBe('invoice');
  });
  it('schedules a downgrade for the end of the period (next_period)', () => {
    expect(prorationBehaviorFor('downgrade')).toBe('next_period');
  });
});

describe('which subscriptions can be changed', () => {
  it('allows active and trialing', () => {
    expect(planChangeBlocker({ status: 'active', cancelAtPeriodEnd: false })).toBeNull();
    expect(planChangeBlocker({ status: 'trialing', cancelAtPeriodEnd: false })).toBeNull();
  });
  it('refuses a subscription that is not live', () => {
    for (const status of ['canceled', 'revoked', 'past_due', 'incomplete']) {
      expect(planChangeBlocker({ status, cancelAtPeriodEnd: false })).toBe('not_active');
    }
  });
  it('refuses one scheduled to cancel (Polar requires uncancel first)', () => {
    expect(planChangeBlocker({ status: 'active', cancelAtPeriodEnd: true })).toBe('cancel_scheduled');
  });
});

describe('estimate of today’s upgrade charge', () => {
  const periodStart = new Date('2026-11-01T00:00:00.000Z');
  const periodEnd = new Date('2026-12-01T00:00:00.000Z');

  it('charges half the difference at the half-way point', () => {
    const now = new Date('2026-11-16T00:00:00.000Z'); // 15 of 30 days left
    expect(
      estimateUpgradeCharge({ currentAmountMinor: 999, targetAmountMinor: 2499, periodStart, periodEnd, now })
    ).toBe(750);
  });

  it('charges the whole difference at the very start', () => {
    expect(
      estimateUpgradeCharge({ currentAmountMinor: 999, targetAmountMinor: 2499, periodStart, periodEnd, now: periodStart })
    ).toBe(1500);
  });

  it('never returns a negative charge', () => {
    const now = new Date('2026-11-16T00:00:00.000Z');
    expect(
      estimateUpgradeCharge({ currentAmountMinor: 2499, targetAmountMinor: 999, periodStart, periodEnd, now })
    ).toBe(0);
  });

  it('refuses to guess outside the period or with bad input', () => {
    const after = new Date('2026-12-02T00:00:00.000Z');
    const before = new Date('2026-10-01T00:00:00.000Z');
    const base = { currentAmountMinor: 999, targetAmountMinor: 2499, periodStart, periodEnd };
    expect(estimateUpgradeCharge({ ...base, now: after })).toBeNull();
    expect(estimateUpgradeCharge({ ...base, now: before })).toBeNull();
    expect(estimateUpgradeCharge({ ...base, periodEnd: periodStart, now: periodStart })).toBeNull();
    expect(estimateUpgradeCharge({ ...base, targetAmountMinor: Number.NaN, now: periodStart })).toBeNull();
  });
});

describe('finding the order Polar raised for the change', () => {
  const requestedAt = new Date('2026-11-16T10:00:00.000Z');
  const order = (over: Record<string, unknown>) => ({
    id: 'ord-1',
    billingReason: 'subscription_update',
    createdAt: '2026-11-16T10:00:05.000Z',
    totalAmount: 750,
    currency: 'usd',
    ...over,
  });

  it('picks the subscription_update order created now', () => {
    expect(findPlanChangeOrder([order({})], requestedAt)?.id).toBe('ord-1');
  });

  it('ignores renewals and first purchases', () => {
    expect(findPlanChangeOrder([order({ billingReason: 'subscription_cycle' })], requestedAt)).toBeNull();
    expect(findPlanChangeOrder([order({ billingReason: 'subscription_create' })], requestedAt)).toBeNull();
  });

  it('ignores an older upgrade, so a past charge is never reported as today’s', () => {
    expect(findPlanChangeOrder([order({ createdAt: '2026-10-01T10:00:00.000Z' })], requestedAt)).toBeNull();
  });
});

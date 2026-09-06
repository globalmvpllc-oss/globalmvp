import { describe, it, expect } from 'vitest';
import { resolvePlan, isGrantActive, grantedPlanValue } from '@/lib/billing/granted-plan';
import type { SubscriptionLike } from '@/lib/billing/access';

/**
 * Plan resolution precedence: an active Polar subscription always wins, then an
 * admin grant while it is in force, then Free — which the automatic trial may
 * still lift to Pro.
 */

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);

// Old enough that the 15-day trial is not active and cannot interfere.
const OLD = daysAgo(60);

const activeSub = (plan: string): SubscriptionLike => ({
  plan,
  status: 'active',
  currentPeriodEnd: daysAhead(10),
  cancelAtPeriodEnd: false,
});

describe('grantedPlanValue', () => {
  it('narrows to a real paid plan or null', () => {
    expect(grantedPlanValue('pro')).toBe('pro');
    expect(grantedPlanValue('business')).toBe('business');
    expect(grantedPlanValue('free')).toBeNull();
    expect(grantedPlanValue(null)).toBeNull();
    expect(grantedPlanValue('platinum')).toBeNull();
  });
});

describe('isGrantActive', () => {
  it('is open-ended with a null expiry', () => {
    expect(isGrantActive(null, NOW)).toBe(true);
    expect(isGrantActive(undefined, NOW)).toBe(true);
  });
  it('is active before expiry, inactive at and after it', () => {
    expect(isGrantActive(daysAhead(1), NOW)).toBe(true);
    expect(isGrantActive(NOW, NOW)).toBe(false);
    expect(isGrantActive(daysAgo(1), NOW)).toBe(false);
  });
  it('fails closed on an unparseable expiry', () => {
    expect(isGrantActive('not-a-date', NOW)).toBe(false);
  });
});

describe('resolvePlan precedence', () => {
  it('an active Polar subscription wins over a grant', () => {
    expect(
      resolvePlan(
        { subscription: activeSub('pro'), grantedPlan: 'business', grantedPlanUntil: null, trialAnchor: OLD },
        NOW
      )
    ).toBe('pro');
  });

  it('a grant wins over Free when there is no active subscription', () => {
    expect(
      resolvePlan(
        { subscription: null, grantedPlan: 'business', grantedPlanUntil: null, trialAnchor: OLD },
        NOW
      )
    ).toBe('business');
  });

  it('an expired grant is ignored', () => {
    expect(
      resolvePlan(
        { subscription: null, grantedPlan: 'pro', grantedPlanUntil: daysAgo(1), trialAnchor: OLD },
        NOW
      )
    ).toBe('free');
  });

  it('a future-dated grant applies', () => {
    expect(
      resolvePlan(
        { subscription: null, grantedPlan: 'pro', grantedPlanUntil: daysAhead(30), trialAnchor: OLD },
        NOW
      )
    ).toBe('pro');
  });

  it('a revoked subscription does not win — the grant applies instead', () => {
    const revoked: SubscriptionLike = { plan: 'business', status: 'revoked', currentPeriodEnd: daysAhead(10) };
    expect(
      resolvePlan(
        { subscription: revoked, grantedPlan: 'pro', grantedPlanUntil: null, trialAnchor: OLD },
        NOW
      )
    ).toBe('pro');
  });

  it('falls back to the automatic trial when Free and recently created', () => {
    expect(
      resolvePlan(
        { subscription: null, grantedPlan: null, grantedPlanUntil: null, trialAnchor: daysAgo(2) },
        NOW
      )
    ).toBe('pro');
  });

  it('is Free with no subscription, no grant, and a lapsed trial', () => {
    expect(
      resolvePlan(
        { subscription: null, grantedPlan: null, grantedPlanUntil: null, trialAnchor: OLD },
        NOW
      )
    ).toBe('free');
  });
});

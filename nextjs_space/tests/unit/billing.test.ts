import { describe, it, expect } from 'vitest';
import {
  PAID_PLANS,
  BILLING_INTERVALS,
  isPaidPlan,
  isBillingInterval,
  priceIdFor,
  planForPriceId,
  isBillingConfigured,
} from '@/lib/billing/plans';
import {
  hasPaidAccess,
  currentPlan,
  meetsPlan,
  billingState,
  daysRemaining,
  isSubscriptionStatus,
  type SubscriptionLike,
} from '@/lib/billing/access';

/**
 * Pure billing logic: which price is which plan, and what a status grants.
 *
 * No Polar ids, tokens or subscription records are invented here — the
 * environment is passed in explicitly, so these exercise the mapping without
 * pretending a real account exists.
 */

/** A fully configured environment, using obvious placeholders. */
const ENV = {
  POLAR_ACCESS_TOKEN: 'token-placeholder',
  POLAR_WEBHOOK_SECRET: 'secret-placeholder',
  POLAR_PRO_PRICE_MONTHLY: 'price-pro-monthly',
  POLAR_PRO_PRICE_YEARLY: 'price-pro-yearly',
  POLAR_BUSINESS_PRICE_MONTHLY: 'price-business-monthly',
  POLAR_BUSINESS_PRICE_YEARLY: 'price-business-yearly',
};

const NOW = new Date('2026-06-15T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function sub(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: days(20),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('plan and interval guards', () => {
  it.each(['pro', 'business'])('accepts %s as a paid plan', (plan) => {
    expect(isPaidPlan(plan)).toBe(true);
  });

  it.each(['free', 'enterprise', '', null, undefined, 42])('rejects %s', (value) => {
    // 'free' is deliberately not a paid plan: it is the absence of a row.
    expect(isPaidPlan(value)).toBe(false);
  });

  it.each(['month', 'year'])('accepts %s as an interval', (interval) => {
    expect(isBillingInterval(interval)).toBe(true);
  });

  it.each(['weekly', 'monthly', '', null])('rejects interval %s', (value) => {
    expect(isBillingInterval(value)).toBe(false);
  });
});

describe('priceIdFor', () => {
  it('returns the configured id for every plan and interval', () => {
    expect(priceIdFor('pro', 'month', ENV)).toBe('price-pro-monthly');
    expect(priceIdFor('pro', 'year', ENV)).toBe('price-pro-yearly');
    expect(priceIdFor('business', 'month', ENV)).toBe('price-business-monthly');
    expect(priceIdFor('business', 'year', ENV)).toBe('price-business-yearly');
  });

  it('returns null rather than throwing when unset', () => {
    // Lets a caller answer "billing is not configured" instead of crashing.
    expect(priceIdFor('pro', 'month', {})).toBeNull();
  });

  it.each(['', '   '])('treats a blank value (%s) as unset', (value) => {
    expect(priceIdFor('pro', 'month', { POLAR_PRO_PRICE_MONTHLY: value })).toBeNull();
  });

  it('covers every plan and interval combination', () => {
    for (const plan of PAID_PLANS) {
      for (const interval of BILLING_INTERVALS) {
        expect(priceIdFor(plan, interval, ENV)).toBeTruthy();
      }
    }
  });
});

describe('planForPriceId', () => {
  it.each([
    ['price-pro-monthly', 'pro', 'month'],
    ['price-pro-yearly', 'pro', 'year'],
    ['price-business-monthly', 'business', 'month'],
    ['price-business-yearly', 'business', 'year'],
  ])('resolves %s to %s/%s', (priceId, plan, interval) => {
    expect(planForPriceId(priceId, ENV)).toEqual({ plan, interval });
  });

  it('returns null for an unknown price', () => {
    // Better an explicit gap than recording someone on a plan they did not buy.
    expect(planForPriceId('price-someone-elses', ENV)).toBeNull();
  });

  it.each([null, undefined, '', '   ', 42, {}])('returns null for %s', (value) => {
    expect(planForPriceId(value, ENV)).toBeNull();
  });

  it('round-trips with priceIdFor', () => {
    for (const plan of PAID_PLANS) {
      for (const interval of BILLING_INTERVALS) {
        const id = priceIdFor(plan, interval, ENV)!;
        expect(planForPriceId(id, ENV)).toEqual({ plan, interval });
      }
    }
  });
});

describe('isBillingConfigured', () => {
  it('is true only when the token, secret and all four prices are present', () => {
    expect(isBillingConfigured(ENV)).toBe(true);
  });

  it('is false on an empty environment', () => {
    expect(isBillingConfigured({})).toBe(false);
  });

  it.each([
    'POLAR_ACCESS_TOKEN',
    'POLAR_WEBHOOK_SECRET',
    'POLAR_PRO_PRICE_MONTHLY',
    'POLAR_BUSINESS_PRICE_YEARLY',
  ])('is false when %s is missing', (key) => {
    const partial = { ...ENV, [key]: undefined };
    expect(isBillingConfigured(partial)).toBe(false);
  });
});

describe('status guard', () => {
  it.each(['trialing', 'active', 'past_due', 'canceled', 'revoked', 'incomplete'])(
    'accepts %s',
    (status) => {
      expect(isSubscriptionStatus(status)).toBe(true);
    }
  );

  it.each(['free', 'paid', '', null])('rejects %s', (value) => {
    expect(isSubscriptionStatus(value)).toBe(false);
  });
});

describe('hasPaidAccess', () => {
  it('is false with no subscription — that is the Free plan', () => {
    expect(hasPaidAccess(null, NOW)).toBe(false);
    expect(hasPaidAccess(undefined, NOW)).toBe(false);
  });

  it.each(['trialing', 'active'])('grants access while %s and in period', (status) => {
    expect(hasPaidAccess(sub({ status }), NOW)).toBe(true);
  });

  it('keeps access while past_due', () => {
    // A bounced renewal usually means an expired card and Polar retries for
    // days. Locking someone out of their own books immediately would lose the
    // customer faster than it recovers the payment; `revoked` is the cut-off.
    expect(hasPaidAccess(sub({ status: 'past_due' }), NOW)).toBe(true);
  });

  it('keeps access after cancelling until the paid period ends', () => {
    const canceled = sub({ status: 'canceled', cancelAtPeriodEnd: true });
    expect(hasPaidAccess(canceled, NOW)).toBe(true);
  });

  it('withdraws access once a cancelled period has elapsed', () => {
    const expired = sub({ status: 'canceled', currentPeriodEnd: days(-1) });
    expect(hasPaidAccess(expired, NOW)).toBe(false);
  });

  it.each(['revoked', 'incomplete'])('denies access when %s', (status) => {
    expect(hasPaidAccess(sub({ status }), NOW)).toBe(false);
  });

  it('denies access when the period has already ended', () => {
    expect(hasPaidAccess(sub({ currentPeriodEnd: days(-1) }), NOW)).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(hasPaidAccess(sub({ currentPeriodEnd: NOW }), NOW)).toBe(false);
  });

  it('fails closed on an unparseable period end', () => {
    expect(hasPaidAccess(sub({ currentPeriodEnd: 'not-a-date' }), NOW)).toBe(false);
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(hasPaidAccess(sub({ currentPeriodEnd: days(5).toISOString() }), NOW)).toBe(true);
  });
});

describe('currentPlan', () => {
  it('is free without a subscription', () => {
    expect(currentPlan(null, NOW)).toBe('free');
  });

  it.each(['pro', 'business'])('reports %s while entitled', (plan) => {
    expect(currentPlan(sub({ plan }), NOW)).toBe(plan);
  });

  it('falls back to free once access lapses', () => {
    expect(currentPlan(sub({ status: 'revoked' }), NOW)).toBe('free');
  });

  it('falls back to free for an unrecognised plan value', () => {
    expect(currentPlan(sub({ plan: 'platinum' }), NOW)).toBe('free');
  });
});

describe('meetsPlan', () => {
  it('lets business satisfy a pro requirement', () => {
    expect(meetsPlan(sub({ plan: 'business' }), 'pro', NOW)).toBe(true);
  });

  it('does not let pro satisfy a business requirement', () => {
    expect(meetsPlan(sub({ plan: 'pro' }), 'business', NOW)).toBe(false);
  });

  it('lets everyone satisfy a free requirement', () => {
    expect(meetsPlan(null, 'free', NOW)).toBe(true);
  });

  it('denies a paid requirement once the subscription lapses', () => {
    expect(meetsPlan(sub({ plan: 'business', status: 'revoked' }), 'pro', NOW)).toBe(false);
  });
});

describe('billingState', () => {
  it('is free with no subscription', () => {
    expect(billingState(null, NOW)).toBe('free');
  });

  it('is trialing during a trial', () => {
    expect(billingState(sub({ status: 'trialing' }), NOW)).toBe('trialing');
  });

  it('is active on a healthy subscription', () => {
    expect(billingState(sub(), NOW)).toBe('active');
  });

  it('is past_due when a renewal has failed', () => {
    expect(billingState(sub({ status: 'past_due' }), NOW)).toBe('past_due');
  });

  it('is canceling while a cancelled subscription still has time left', () => {
    expect(billingState(sub({ cancelAtPeriodEnd: true }), NOW)).toBe('canceling');
  });

  it('is expired once access has gone', () => {
    expect(billingState(sub({ status: 'revoked' }), NOW)).toBe('expired');
    expect(billingState(sub({ currentPeriodEnd: days(-1) }), NOW)).toBe('expired');
  });

  it('distinguishes never-subscribed from lapsed', () => {
    // Both are unpaid, but the screen should say different things.
    expect(billingState(null, NOW)).not.toBe(billingState(sub({ status: 'revoked' }), NOW));
  });
});

describe('daysRemaining', () => {
  it('counts whole days to the period end', () => {
    expect(daysRemaining(sub({ currentPeriodEnd: days(20) }), NOW)).toBe(20);
  });

  it('floors a partial day', () => {
    const end = new Date(NOW.getTime() + 3.9 * 86_400_000);
    // Telling someone 3 days when 3.9 remain is the safe rounding.
    expect(daysRemaining(sub({ currentPeriodEnd: end }), NOW)).toBe(3);
  });

  it('never goes negative', () => {
    expect(daysRemaining(sub({ currentPeriodEnd: days(-5) }), NOW)).toBe(0);
  });

  it('returns null without a usable date', () => {
    expect(daysRemaining(null, NOW)).toBeNull();
    expect(daysRemaining(sub({ currentPeriodEnd: 'nonsense' }), NOW)).toBeNull();
  });
});

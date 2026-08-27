import { describe, it, expect } from 'vitest';
import {
  productIdFor,
  polarPriceIdFor,
  planForConfiguredId,
  planForPolarPriceId,
  priceIdFor,
  planForPriceId,
  PAID_PLANS,
  BILLING_INTERVALS,
} from '@/lib/billing/plans';
import { mapSubscriptionEvent } from '@/lib/billing/webhook-mapping';

/**
 * Product id vs price id.
 *
 * The POLAR_*_PRICE_* variables hold Polar PRODUCT ids (checkout and the pricing
 * panel use them that way). A subscription webhook, however, reports the PRICE
 * id charged. These cover both the dedicated price-id variables and the
 * fallback that lets a deployment configured with only product ids still
 * attribute a subscription — which was the bug: the same value was read as a
 * product id in two places and as a price id in a third.
 *
 * No real Polar ids or secrets appear here; the environment is passed in.
 */

/** Product ids only — the common production configuration. */
const PRODUCT_ONLY = {
  POLAR_PRO_PRICE_MONTHLY: 'prod_pro_m',
  POLAR_PRO_PRICE_YEARLY: 'prod_pro_y',
  POLAR_BUSINESS_PRICE_MONTHLY: 'prod_biz_m',
  POLAR_BUSINESS_PRICE_YEARLY: 'prod_biz_y',
};

/** Product ids plus the optional dedicated price ids. */
const WITH_PRICE_IDS = {
  ...PRODUCT_ONLY,
  POLAR_PRO_PRICE_ID_MONTHLY: 'price_pro_m',
  POLAR_PRO_PRICE_ID_YEARLY: 'price_pro_y',
  POLAR_BUSINESS_PRICE_ID_MONTHLY: 'price_biz_m',
  POLAR_BUSINESS_PRICE_ID_YEARLY: 'price_biz_y',
};

const RECEIVED = new Date('2026-06-15T12:00:00.000Z');

/** A payload shaped like Polar's subscription object. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    customerId: 'cus-1',
    productId: 'prod_pro_m',
    priceId: 'price_pro_m',
    status: 'active',
    currency: 'usd',
    amount: 2900,
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    modifiedAt: '2026-06-15T11:00:00.000Z',
    metadata: { companyId: 'company-1' },
    ...overrides,
  };
}

describe('productIdFor', () => {
  it('returns the configured product id for every plan and interval', () => {
    expect(productIdFor('pro', 'month', PRODUCT_ONLY)).toBe('prod_pro_m');
    expect(productIdFor('pro', 'year', PRODUCT_ONLY)).toBe('prod_pro_y');
    expect(productIdFor('business', 'month', PRODUCT_ONLY)).toBe('prod_biz_m');
    expect(productIdFor('business', 'year', PRODUCT_ONLY)).toBe('prod_biz_y');
  });

  it('is the same function as the backward-compatible priceIdFor alias', () => {
    expect(priceIdFor).toBe(productIdFor);
    expect(priceIdFor('pro', 'month', PRODUCT_ONLY)).toBe('prod_pro_m');
  });

  it('returns null when unset', () => {
    expect(productIdFor('pro', 'month', {})).toBeNull();
  });
});

describe('polarPriceIdFor', () => {
  it('returns the dedicated price id when configured', () => {
    expect(polarPriceIdFor('pro', 'month', WITH_PRICE_IDS)).toBe('price_pro_m');
    expect(polarPriceIdFor('business', 'year', WITH_PRICE_IDS)).toBe('price_biz_y');
  });

  it('returns null when the dedicated price-id variables are unset', () => {
    expect(polarPriceIdFor('pro', 'month', PRODUCT_ONLY)).toBeNull();
  });
});

describe('planForConfiguredId (product-id variables)', () => {
  it('resolves a product id to its plan and interval', () => {
    expect(planForConfiguredId('prod_biz_y', PRODUCT_ONLY)).toEqual({
      plan: 'business',
      interval: 'year',
    });
  });

  it('does not resolve a real price id against product-id variables', () => {
    expect(planForConfiguredId('price_pro_m', PRODUCT_ONLY)).toBeNull();
  });

  it('is the same function as the backward-compatible planForPriceId alias', () => {
    expect(planForPriceId).toBe(planForConfiguredId);
  });

  it.each([null, undefined, '', '   ', 42, {}])('returns null for %s', (value) => {
    expect(planForConfiguredId(value, PRODUCT_ONLY)).toBeNull();
  });
});

describe('planForPolarPriceId (dedicated price-id variables)', () => {
  it('resolves a real price id to its plan and interval', () => {
    expect(planForPolarPriceId('price_pro_y', WITH_PRICE_IDS)).toEqual({
      plan: 'pro',
      interval: 'year',
    });
  });

  it('returns null when the dedicated variables are unset', () => {
    expect(planForPolarPriceId('price_pro_m', PRODUCT_ONLY)).toBeNull();
  });
});

describe('webhook plan attribution', () => {
  it('falls back to the product id when only product ids are configured', () => {
    // The production bug: env holds product ids, the payload carries a real
    // price id that matches nothing, but the product id attributes the plan.
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price_live_unknown', productId: 'prod_biz_m' }),
      PRODUCT_ONLY,
      RECEIVED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.plan).toBe('business');
    expect(result.record.interval).toBe('month');
  });

  it('prefers the exact price id when the dedicated variables are set', () => {
    // priceId points at Pro monthly, productId at Business monthly. The price id
    // wins, because it is the more precise signal of what was charged.
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price_pro_m', productId: 'prod_biz_m' }),
      WITH_PRICE_IDS,
      RECEIVED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.plan).toBe('pro');
    expect(result.record.interval).toBe('month');
  });

  it('rejects a payload whose price and product match nothing configured', () => {
    const result = mapSubscriptionEvent(
      'subscription.created',
      payload({ priceId: 'price_x', productId: 'prod_x' }),
      PRODUCT_ONLY,
      RECEIVED
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unrecognised price');
  });
});

describe('coverage of every plan and interval', () => {
  it('has a product-id variable for each combination', () => {
    for (const plan of PAID_PLANS) {
      for (const interval of BILLING_INTERVALS) {
        expect(productIdFor(plan, interval, PRODUCT_ONLY)).toBeTruthy();
      }
    }
  });

  it('round-trips every dedicated price id back to its plan', () => {
    for (const plan of PAID_PLANS) {
      for (const interval of BILLING_INTERVALS) {
        const id = polarPriceIdFor(plan, interval, WITH_PRICE_IDS)!;
        expect(planForPolarPriceId(id, WITH_PRICE_IDS)).toEqual({ plan, interval });
      }
    }
  });
});

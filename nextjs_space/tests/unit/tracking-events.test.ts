import { describe, it, expect } from 'vitest';
import {
  buildTrackingCalls,
  dedupeKeyFor,
  readTrackingConfig,
  type TrackingConfig,
  type TrackingEvent,
} from '@/lib/tracking/events';
import { DENY_ALL, GRANT_ALL } from '@/lib/consent';

/**
 * Conversion measurement rules: what is sent, to whom, and when nothing is.
 * Ids below are made up and only need the right shape.
 */

const FULL: TrackingConfig = readTrackingConfig({
  NEXT_PUBLIC_GA4_ID: 'G-TEST1234',
  NEXT_PUBLIC_GOOGLE_ADS_ID: 'AW-1234567890',
  NEXT_PUBLIC_GADS_LABEL_SIGNUP: 'signupLabel1',
  NEXT_PUBLIC_GADS_LABEL_PURCHASE: 'purchaseLabel1',
  NEXT_PUBLIC_META_PIXEL_ID: '123456789012345',
});

const PURCHASE: TrackingEvent = {
  name: 'purchase',
  transactionId: 'chk_123',
  plan: 'pro',
  interval: 'month',
  value: 9.99,
  currency: 'usd',
};

const sendTo = (calls: ReturnType<typeof buildTrackingCalls>) =>
  calls.map((c) => (c.vendor === 'fbq' ? `fbq:${c.args[1]}` : `gtag:${(c.args[2] as { send_to: string }).send_to}`));

describe('configuration', () => {
  it('turns every tool off when no variable is set', () => {
    const none = readTrackingConfig({});
    expect(Object.values(none).every((v) => v === null)).toBe(true);
    expect(buildTrackingCalls(PURCHASE, none, GRANT_ALL)).toEqual([]);
    expect(buildTrackingCalls({ name: 'sign_up' }, none, GRANT_ALL)).toEqual([]);
  });

  it('ignores malformed ids rather than loading a broken tag', () => {
    const bad = readTrackingConfig({
      NEXT_PUBLIC_GA4_ID: 'UA-123',
      NEXT_PUBLIC_GOOGLE_ADS_ID: '12345',
      NEXT_PUBLIC_META_PIXEL_ID: 'abc',
    });
    expect(bad.ga4Id).toBeNull();
    expect(bad.googleAdsId).toBeNull();
    expect(bad.metaPixelId).toBeNull();
  });

  it('runs the tools that are configured and skips the rest', () => {
    const onlyGa4 = readTrackingConfig({ NEXT_PUBLIC_GA4_ID: 'G-TEST1234' });
    expect(sendTo(buildTrackingCalls(PURCHASE, onlyGa4, GRANT_ALL))).toEqual(['gtag:G-TEST1234']);
  });
});

describe('consent', () => {
  it('sends nothing without a decision', () => {
    expect(buildTrackingCalls(PURCHASE, FULL, null)).toEqual([]);
  });

  it('sends nothing after "Reject"', () => {
    expect(buildTrackingCalls(PURCHASE, FULL, DENY_ALL)).toEqual([]);
    expect(buildTrackingCalls({ name: 'sign_up' }, FULL, DENY_ALL)).toEqual([]);
  });

  it('measurement only: GA4 yes, Ads and Meta no', () => {
    expect(sendTo(buildTrackingCalls(PURCHASE, FULL, { ads: false, analytics: true }))).toEqual(['gtag:G-TEST1234']);
  });

  it('advertising only: Ads and Meta yes, GA4 no', () => {
    expect(sendTo(buildTrackingCalls(PURCHASE, FULL, { ads: true, analytics: false }))).toEqual([
      'gtag:AW-1234567890/purchaseLabel1',
      'fbq:Purchase',
    ]);
  });
});

describe('events', () => {
  it('sign up goes to GA4, the Ads SIGNUP label and Meta CompleteRegistration', () => {
    expect(sendTo(buildTrackingCalls({ name: 'sign_up' }, FULL, GRANT_ALL))).toEqual([
      'gtag:G-TEST1234',
      'gtag:AW-1234567890/signupLabel1',
      'fbq:CompleteRegistration',
    ]);
  });

  it('begin checkout goes to GA4 and Meta InitiateCheckout, not to Ads', () => {
    const calls = buildTrackingCalls(
      { name: 'begin_checkout', plan: 'business', interval: 'year', value: 249, currency: 'USD' },
      FULL,
      GRANT_ALL
    );
    expect(sendTo(calls)).toEqual(['gtag:G-TEST1234', 'fbq:InitiateCheckout']);
  });

  it('purchase carries the amount, currency and transaction id everywhere', () => {
    const calls = buildTrackingCalls(PURCHASE, FULL, GRANT_ALL);
    expect(sendTo(calls)).toEqual(['gtag:G-TEST1234', 'gtag:AW-1234567890/purchaseLabel1', 'fbq:Purchase']);
    const ga4 = calls[0].args[2] as Record<string, unknown>;
    expect(ga4).toMatchObject({ transaction_id: 'chk_123', value: 9.99, currency: 'USD' });
    const ads = calls[1].args[2] as Record<string, unknown>;
    expect(ads).toMatchObject({ transaction_id: 'chk_123', value: 9.99, currency: 'USD' });
    expect(calls[2].args[3]).toEqual({ eventID: 'chk_123' });
  });

  it('a purchase without a valid amount is not reported', () => {
    expect(buildTrackingCalls({ ...PURCHASE, value: Number.NaN } as TrackingEvent, FULL, GRANT_ALL)).toEqual([]);
    expect(buildTrackingCalls({ ...PURCHASE, currency: '' } as TrackingEvent, FULL, GRANT_ALL)).toEqual([]);
  });

  it('a plan upgrade is a GA4 purchase of the difference only', () => {
    const calls = buildTrackingCalls(
      { name: 'plan_upgrade', transactionId: 'ord_9', plan: 'business', value: 7.5, currency: 'USD' },
      FULL,
      GRANT_ALL
    );
    expect(sendTo(calls)).toEqual(['gtag:G-TEST1234']);
    expect(calls[0].args[1]).toBe('purchase');
    expect(calls[0].args[2]).toMatchObject({ transaction_id: 'ord_9', value: 7.5 });
  });
});

describe('counted once', () => {
  it('money events are keyed on their transaction id', () => {
    expect(dedupeKeyFor(PURCHASE)).toBe('cc_tracked_chk_123');
    expect(
      dedupeKeyFor({ name: 'plan_upgrade', transactionId: 'ord_9', plan: 'business', value: 1, currency: 'USD' })
    ).toBe('cc_tracked_ord_9');
    expect(dedupeKeyFor({ name: 'sign_up' })).toBeNull();
  });
});

describe('no personal data', () => {
  it('no event payload contains a name, email or phone field', () => {
    const events: TrackingEvent[] = [
      { name: 'sign_up' },
      { name: 'begin_checkout', plan: 'pro', interval: 'month', value: 9.99, currency: 'USD' },
      PURCHASE,
      { name: 'plan_upgrade', transactionId: 'ord_9', plan: 'business', value: 7.5, currency: 'USD' },
    ];
    const text = JSON.stringify(events.flatMap((e) => buildTrackingCalls(e, FULL, GRANT_ALL)));
    expect(text).not.toMatch(/email|e-mail|phone|name"\s*:\s*"(?!CorpControl)|first_name|last_name|user_data/i);
    expect(text).not.toMatch(/@/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  TRIAL_DAYS,
  trialEndsAt,
  isTrialActive,
  trialDaysRemaining,
  effectivePlan,
  isOnTrial,
} from '@/lib/billing/trial';

/**
 * The automatic Pro trial.
 *
 * It is a pure function of Company.createdAt — a server-owned timestamp — so the
 * tests pin the window, its expiry, the rule that a purchase always wins, and
 * the fact that nothing a client could send can lengthen it.
 */

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe('trial window', () => {
  it('ends exactly 15 days after the company was created', () => {
    const created = new Date('2026-06-01T00:00:00.000Z');
    expect(trialEndsAt(created)).toEqual(new Date(created.getTime() + TRIAL_DAYS * DAY));
    expect(TRIAL_DAYS).toBe(15);
  });

  it('is active inside the window', () => {
    expect(isTrialActive(daysAgo(0), NOW)).toBe(true);
    expect(isTrialActive(daysAgo(1), NOW)).toBe(true);
    expect(isTrialActive(daysAgo(14), NOW)).toBe(true);
  });

  it('counts whole days remaining, floored', () => {
    expect(trialDaysRemaining(daysAgo(0), NOW)).toBe(15);
    expect(trialDaysRemaining(daysAgo(10), NOW)).toBe(5);
    const created = new Date(NOW.getTime() - 10.9 * DAY);
    expect(trialDaysRemaining(created, NOW)).toBe(4);
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(isTrialActive(daysAgo(1).toISOString(), NOW)).toBe(true);
  });

  it('returns null for a missing or unparseable creation date', () => {
    expect(trialEndsAt(null)).toBeNull();
    expect(trialEndsAt('nonsense')).toBeNull();
    expect(trialDaysRemaining(undefined, NOW)).toBeNull();
    expect(isTrialActive(null, NOW)).toBe(false);
  });
});

describe('trial expiry', () => {
  it('treats the exact 15-day instant as expired', () => {
    // created + 15 days == now, so the window has closed.
    expect(isTrialActive(daysAgo(15), NOW)).toBe(false);
    expect(trialDaysRemaining(daysAgo(15), NOW)).toBe(0);
  });

  it('is inactive past the window and never reports negative days', () => {
    expect(isTrialActive(daysAgo(16), NOW)).toBe(false);
    expect(isTrialActive(daysAgo(30), NOW)).toBe(false);
    expect(trialDaysRemaining(daysAgo(30), NOW)).toBe(0);
  });

  it('drops a Free company back to Free once the window closes', () => {
    expect(effectivePlan('free', daysAgo(16), NOW)).toBe('free');
    expect(isOnTrial('free', daysAgo(16), NOW)).toBe(false);
  });
});

describe('a purchased plan always wins', () => {
  it('returns the purchased plan even inside the trial window', () => {
    expect(effectivePlan('pro', daysAgo(1), NOW)).toBe('pro');
    expect(effectivePlan('business', daysAgo(1), NOW)).toBe('business');
  });

  it('keeps the purchased plan after the trial window', () => {
    expect(effectivePlan('business', daysAgo(30), NOW)).toBe('business');
    expect(effectivePlan('pro', daysAgo(30), NOW)).toBe('pro');
  });

  it('substitutes Pro for Free only while on trial', () => {
    expect(effectivePlan('free', daysAgo(1), NOW)).toBe('pro');
    expect(effectivePlan('free', daysAgo(30), NOW)).toBe('free');
  });

  it('never treats a paying customer as on trial', () => {
    expect(isOnTrial('pro', daysAgo(1), NOW)).toBe(false);
    expect(isOnTrial('business', daysAgo(1), NOW)).toBe(false);
  });

  it('the trial only ever grants Pro, never Business', () => {
    // A Free company on trial is Pro; there is no path from a trial to Business.
    expect(effectivePlan('free', daysAgo(1), NOW)).toBe('pro');
  });
});

describe('the trial cannot be extended by client input', () => {
  it('is a pure function of the server-owned createdAt and now', () => {
    // The only inputs are the company's own creation date and the current time.
    // There is no trialEndsAt / extend / reset parameter a request could set,
    // so a client cannot lengthen its own trial.
    const created = daysAgo(16);
    expect(effectivePlan('free', created, NOW)).toBe('free');
    expect(isOnTrial('free', created, NOW)).toBe(false);
  });

  it('ties the end date to createdAt alone, with a fixed window length', () => {
    const older = daysAgo(20);
    const newer = daysAgo(2);
    expect(trialEndsAt(older)!.getTime()).toBe(older.getTime() + TRIAL_DAYS * DAY);
    expect(trialEndsAt(newer)!.getTime()).toBe(newer.getTime() + TRIAL_DAYS * DAY);
    // A company created earlier is expired; a later one is still on trial. Only
    // createdAt moves the boundary — there is no separate lever to pull.
    expect(isTrialActive(older, NOW)).toBe(false);
    expect(isTrialActive(newer, NOW)).toBe(true);
  });
});

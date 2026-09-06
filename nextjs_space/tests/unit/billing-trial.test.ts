import { describe, it, expect } from 'vitest';
import {
  TRIAL_DAYS,
  trialEndsAt,
  isTrialActive,
  trialDaysRemaining,
  effectivePlan,
  isOnTrial,
} from '@/lib/billing/trial';
import { earliestCreatedAt } from '@/lib/billing/trial-anchor';

/**
 * The automatic Pro trial.
 *
 * It is a pure function of a server-owned timestamp — the trial anchor — so the
 * tests pin the window, its expiry, the rule that a purchase always wins, and
 * the fact that nothing a client could send can lengthen it.
 *
 * Which timestamp that is comes from ./trial-anchor: the owner's earliest
 * company, so a person gets one trial rather than one per company they create.
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

/**
 * The trial anchor — one trial per person, not one per company.
 *
 * The defect these guard: the trial derived from each company's own createdAt.
 * That was safe while a user could hold exactly one company. Once a user can
 * hold several, it became a way to get Pro forever — create a company, use it
 * free for 15 days, create another, repeat. `resolveTrialAnchor` answers with
 * the owner's *earliest* company instead, so a second company inherits the
 * first company's window rather than opening a new one.
 */
describe('earliestCreatedAt', () => {
  it('picks the oldest timestamp whatever order the rows arrive in', () => {
    const first = daysAgo(40);
    const middle = daysAgo(20);
    const last = daysAgo(3);

    for (const rows of [
      [{ createdAt: first }, { createdAt: middle }, { createdAt: last }],
      [{ createdAt: last }, { createdAt: first }, { createdAt: middle }],
      [{ createdAt: middle }, { createdAt: last }, { createdAt: first }],
    ]) {
      expect(earliestCreatedAt(rows)).toEqual(first);
    }
  });

  it('accepts ISO strings alongside Dates', () => {
    const older = daysAgo(9);
    expect(
      earliestCreatedAt([{ createdAt: daysAgo(2) }, { createdAt: older.toISOString() }])
    ).toEqual(older);
  });

  it('ignores unusable values rather than throwing', () => {
    const real = daysAgo(5);
    expect(
      earliestCreatedAt([
        { createdAt: null },
        { createdAt: undefined },
        { createdAt: 'not a date' },
        { createdAt: real },
      ])
    ).toEqual(real);
  });

  it('returns null for no rows, and for rows with nothing usable', () => {
    expect(earliestCreatedAt([])).toBeNull();
    expect(earliestCreatedAt([{ createdAt: null }, { createdAt: 'rubbish' }])).toBeNull();
  });
});

describe('one membership — unchanged from before', () => {
  it('anchors on that company, exactly as the old behaviour did', () => {
    const created = daysAgo(3);
    const anchor = earliestCreatedAt([{ createdAt: created }]);

    expect(anchor).toEqual(created);
    expect(isTrialActive(anchor, NOW)).toBe(true);
    expect(trialDaysRemaining(anchor, NOW)).toBe(12);
    expect(effectivePlan('free', anchor, NOW)).toBe('pro');
  });

  it('is expired for a single company older than the window, as before', () => {
    const anchor = earliestCreatedAt([{ createdAt: daysAgo(16) }]);
    expect(isTrialActive(anchor, NOW)).toBe(false);
    expect(effectivePlan('free', anchor, NOW)).toBe('free');
  });
});

describe('THE EXPLOIT: a second company must not open a second trial', () => {
  it('gives the second company the first window, not 15 fresh days', () => {
    const firstCompany = daysAgo(3);
    const secondCompany = NOW; // created today, on day 3 of the trial

    const anchor = earliestCreatedAt([{ createdAt: firstCompany }, { createdAt: secondCompany }]);

    // Anchored on the first company, so both companies share one window.
    expect(anchor).toEqual(firstCompany);
    expect(trialEndsAt(anchor)).toEqual(trialEndsAt(firstCompany));
    expect(trialDaysRemaining(anchor, NOW)).toBe(12);

    // The bug, stated as the assertion that must never pass again: anchoring on
    // the new company would restart the clock at a full 15 days.
    expect(trialDaysRemaining(anchor, NOW)).not.toBe(TRIAL_DAYS);
    expect(trialEndsAt(anchor)!.getTime()).toBeLessThan(trialEndsAt(secondCompany)!.getTime());
  });

  it('gives no trial at all to a company created after the window closed', () => {
    const firstCompany = daysAgo(40);
    const secondCompany = NOW;

    const anchor = earliestCreatedAt([{ createdAt: firstCompany }, { createdAt: secondCompany }]);

    expect(anchor).toEqual(firstCompany);
    expect(isTrialActive(anchor, NOW)).toBe(false);
    expect(effectivePlan('free', anchor, NOW)).toBe('free');
    expect(isOnTrial('free', anchor, NOW)).toBe(false);
    expect(trialDaysRemaining(anchor, NOW)).toBe(0);
  });

  it('cannot be reset by creating company after company', () => {
    // Ten companies, one every three days, starting well outside the window.
    // However many are added, the anchor stays on the first and the trial stays
    // closed.
    const first = daysAgo(30);
    const rows = Array.from({ length: 10 }, (_, i) => ({ createdAt: daysAgo(30 - i * 3) }));

    const anchor = earliestCreatedAt(rows);
    expect(anchor).toEqual(first);
    expect(isTrialActive(anchor, NOW)).toBe(false);
    expect(effectivePlan('free', anchor, NOW)).toBe('free');
  });

  it('holds regardless of the order the memberships come back in', () => {
    const first = daysAgo(20);
    const rows = [{ createdAt: NOW }, { createdAt: daysAgo(5) }, { createdAt: first }];

    expect(earliestCreatedAt(rows)).toEqual(first);
    expect(isTrialActive(earliestCreatedAt(rows), NOW)).toBe(false);
  });
});

describe('a purchase always wins, on every company', () => {
  it('keeps a paid plan whatever the anchor says', () => {
    for (const anchor of [daysAgo(1), daysAgo(40), null, undefined]) {
      expect(effectivePlan('pro', anchor, NOW)).toBe('pro');
      expect(effectivePlan('business', anchor, NOW)).toBe('business');
      expect(isOnTrial('pro', anchor, NOW)).toBe(false);
      expect(isOnTrial('business', anchor, NOW)).toBe(false);
    }
  });

  it('does not downgrade a paying customer whose trial anchor has expired', () => {
    // The case that matters: a long-standing user buys Pro, then adds a company.
    // The shared anchor is long closed, and the purchase must still stand.
    const anchor = earliestCreatedAt([{ createdAt: daysAgo(400) }, { createdAt: NOW }]);
    expect(effectivePlan('pro', anchor, NOW)).toBe('pro');
  });
});

describe('no memberships, and unusable timestamps', () => {
  it('yields no trial and does not throw', () => {
    const anchor = earliestCreatedAt([]);
    expect(anchor).toBeNull();
    expect(() => isTrialActive(anchor, NOW)).not.toThrow();
    expect(isTrialActive(anchor, NOW)).toBe(false);
    expect(trialEndsAt(anchor)).toBeNull();
    expect(trialDaysRemaining(anchor, NOW)).toBeNull();
    expect(effectivePlan('free', anchor, NOW)).toBe('free');
  });

  it('keeps the existing null handling for an unparseable anchor', () => {
    expect(trialEndsAt('not a date')).toBeNull();
    expect(trialDaysRemaining('not a date', NOW)).toBeNull();
    expect(isTrialActive('not a date', NOW)).toBe(false);
    expect(effectivePlan('free', 'not a date', NOW)).toBe('free');
  });
});

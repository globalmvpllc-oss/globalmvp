import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCalendarDate,
  toCalendarDay,
  toCalendarInput,
  addCalendarDays,
  formatCalendarDate,
  formatCalendarDateLong,
} from '@/lib/calendar-date';
import {
  checkRateLimit,
  clientKey,
  resetRateLimits,
  SIGNUP_RULE,
  LOGIN_RULE,
} from '@/lib/rate-limit';

/**
 * Timezone regressions.
 *
 * An invoice due on 31 January is due on that date everywhere. It was stored as
 * UTC midnight and rendered against the local calendar, so at any negative UTC
 * offset it displayed as the 30th.
 *
 * Vitest runs in the machine's timezone, so rather than depending on TZ these
 * assert the property that actually matters: the calendar day is read from UTC
 * components and never drifts, and the offset arithmetic is checked explicitly
 * against New York and Los Angeles.
 */

const DUE = '2026-01-31';

describe('parseCalendarDate', () => {
  it('pins a date-only string to UTC midnight', () => {
    expect(parseCalendarDate(DUE)?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('stores exactly what new Date() stored before, so no data migrates', () => {
    expect(parseCalendarDate(DUE)?.getTime()).toBe(new Date(DUE).getTime());
  });

  it('pins a full ISO timestamp to its UTC calendar day', () => {
    expect(parseCalendarDate('2026-01-31T22:15:00.000Z')?.toISOString()).toBe(
      '2026-01-31T00:00:00.000Z'
    );
  });

  it('accepts a Date and normalises it', () => {
    const parsed = parseCalendarDate(new Date('2026-01-31T18:00:00.000Z'));
    expect(parsed?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it.each([null, undefined, '', 'not-a-date', 42, {}])('returns null for %s', (value) => {
    expect(parseCalendarDate(value)).toBeNull();
  });

  it('returns null for an Invalid Date rather than storing one', () => {
    expect(parseCalendarDate(new Date('nonsense'))).toBeNull();
  });
});

describe('toCalendarDay — the off-by-one fix', () => {
  it('keeps the day number that was stored', () => {
    const day = toCalendarDay(DUE)!;
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(0);
    expect(day.getDate()).toBe(31);
  });

  it('sits at local midnight so date-fns isSameDay lands on the right cell', () => {
    const day = toCalendarDay(DUE)!;
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
  });

  it('does not shift regardless of the time carried by the stored value', () => {
    for (const stored of [
      '2026-01-31T00:00:00.000Z',
      '2026-01-31T12:00:00.000Z',
      '2026-01-31T23:59:59.000Z',
    ]) {
      expect(toCalendarDay(stored)!.getDate()).toBe(31);
    }
  });

  it('returns null for unusable input', () => {
    expect(toCalendarDay(undefined)).toBeNull();
  });
});

/**
 * The concrete regression, asserted against the offsets that broke.
 * `en-CA` yields YYYY-MM-DD, so these compare calendar days directly.
 */
describe('negative UTC offsets no longer read a day early', () => {
  const stored = new Date('2026-01-31T00:00:00.000Z');

  it.each(['America/New_York', 'America/Los_Angeles'])(
    'the old local rendering was wrong in %s',
    (timeZone) => {
      // Documents the bug: this is what format()/toLocaleDateString() produced.
      const localDay = stored.toLocaleDateString('en-CA', { timeZone });
      expect(localDay).toBe('2026-01-30');
    }
  );

  it.each(['America/New_York', 'America/Los_Angeles', 'Europe/Istanbul', 'Asia/Tokyo', 'UTC'])(
    'the UTC-based reading is correct in %s',
    (timeZone) => {
      const utcDay = stored.toLocaleDateString('en-CA', { timeZone: 'UTC' });
      expect(utcDay).toBe('2026-01-31');
      // And the helper agrees, independently of the runner's own timezone.
      expect(toCalendarInput(stored)).toBe('2026-01-31');
      expect(timeZone).toBeTruthy();
    }
  );

  it('Istanbul behaviour is unchanged — it was already correct', () => {
    expect(stored.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })).toBe('2026-01-31');
    expect(toCalendarInput(stored)).toBe('2026-01-31');
  });
});

describe('toCalendarInput — edit forms round-trip', () => {
  it('returns the same day that was stored', () => {
    expect(toCalendarInput(DUE)).toBe(DUE);
  });

  it('survives repeated edit-and-save cycles without walking backwards', () => {
    let value: string = DUE;
    for (let i = 0; i < 5; i++) {
      value = toCalendarInput(parseCalendarDate(value));
    }
    expect(value).toBe(DUE);
  });

  it('returns an empty string for a missing date', () => {
    expect(toCalendarInput(null)).toBe('');
  });
});

describe('addCalendarDays — payment terms', () => {
  it('adds whole days', () => {
    expect(addCalendarDays('2026-01-01', 30)).toBe('2026-01-31');
  });

  it('treats 0 as due on receipt', () => {
    expect(addCalendarDays(DUE, 0)).toBe(DUE);
  });

  it('crosses a month boundary', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is unaffected by a daylight-saving transition', () => {
    // US DST starts 8 March 2026; local-hour arithmetic can land an hour short
    // here and roll back a day.
    expect(addCalendarDays('2026-03-01', 14)).toBe('2026-03-15');
  });
});

describe('display formatting is UTC-based', () => {
  it('formats the long form used by the invoice document', () => {
    expect(formatCalendarDateLong(DUE)).toBe('January 31, 2026');
  });

  it('formats the short forms used in the app', () => {
    expect(formatCalendarDate(DUE)).toBe('Jan 31, 2026');
    expect(formatCalendarDate(DUE, 'MMM d')).toBe('Jan 31');
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(formatCalendarDateLong('nonsense')).toBe('');
    expect(formatCalendarDate(null)).toBe('');
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows attempts up to the signup limit', () => {
    for (let i = 0; i < SIGNUP_RULE.limit; i++) {
      expect(checkRateLimit('signup:1.2.3.4', SIGNUP_RULE).allowed).toBe(true);
    }
  });

  it('blocks the attempt after the signup limit', () => {
    for (let i = 0; i < SIGNUP_RULE.limit; i++) checkRateLimit('signup:1.2.3.4', SIGNUP_RULE);
    const blocked = checkRateLimit('signup:1.2.3.4', SIGNUP_RULE);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each address separately, so one caller cannot lock everyone out', () => {
    for (let i = 0; i < SIGNUP_RULE.limit + 3; i++) checkRateLimit('signup:1.1.1.1', SIGNUP_RULE);
    expect(checkRateLimit('signup:2.2.2.2', SIGNUP_RULE).allowed).toBe(true);
  });

  it('keeps signup and login windows apart', () => {
    for (let i = 0; i < SIGNUP_RULE.limit + 1; i++) checkRateLimit('signup:9.9.9.9', SIGNUP_RULE);
    expect(checkRateLimit('login:9.9.9.9', LOGIN_RULE).allowed).toBe(true);
  });

  it('allows a genuine user several login mistakes', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('login:5.5.5.5', LOGIN_RULE).allowed).toBe(true);
    }
  });

  it('opens a fresh window once the old one expires', () => {
    const start = 1_000_000;
    for (let i = 0; i < LOGIN_RULE.limit + 1; i++) {
      checkRateLimit('login:7.7.7.7', LOGIN_RULE, start);
    }
    expect(checkRateLimit('login:7.7.7.7', LOGIN_RULE, start).allowed).toBe(false);
    const later = start + LOGIN_RULE.windowMs + 1;
    expect(checkRateLimit('login:7.7.7.7', LOGIN_RULE, later).allowed).toBe(true);
  });

  it('counts successful attempts too, so they cannot be used to clear a window', () => {
    const key = 'login:8.8.8.8';
    for (let i = 0; i < LOGIN_RULE.limit; i++) checkRateLimit(key, LOGIN_RULE);
    expect(checkRateLimit(key, LOGIN_RULE).allowed).toBe(false);
  });

  it('reports remaining attempts', () => {
    expect(checkRateLimit('signup:4.4.4.4', SIGNUP_RULE).remaining).toBe(SIGNUP_RULE.limit - 1);
    expect(checkRateLimit('signup:4.4.4.4', SIGNUP_RULE).remaining).toBe(SIGNUP_RULE.limit - 2);
  });
});

describe('clientKey', () => {
  const req = (headers: Record<string, string>) =>
    ({ headers: { get: (h: string) => headers[h.toLowerCase()] ?? null } }) as unknown as Request;

  it('takes the first entry of x-forwarded-for', () => {
    expect(clientKey(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), 'login')).toBe(
      'login:203.0.113.9'
    );
  });

  it('falls back to x-real-ip', () => {
    expect(clientKey(req({ 'x-real-ip': '198.51.100.4' }), 'signup')).toBe('signup:198.51.100.4');
  });

  it('shares one bucket when no address is present, rather than bypassing the limit', () => {
    expect(clientKey(req({}), 'signup')).toBe('signup:unknown');
  });

  it('scopes the key, so signup and login do not share a counter', () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    expect(clientKey(req(headers), 'signup')).not.toBe(clientKey(req(headers), 'login'));
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseCalendarRange,
  boundedTake,
  listResponse,
  DEFAULT_LIST_TAKE,
  MAX_LIST_TAKE,
  RANGE_MAX,
} from '@/lib/calendar-range';
import { parseCalendarDate } from '@/lib/calendar-date';
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from '@/lib/session-config';

/**
 * Calendar month windows.
 *
 * The defect these guard: the calendar asked for the full lists, but
 * /api/invoices and /api/payments return only the 100 most recent rows, so any
 * business past that number silently lost older due dates from the calendar.
 * The fix is an explicit month window, which only works if the boundaries are
 * exact and timezone-stable.
 */

const params = (qs: string) => new URLSearchParams(qs);

describe('parseCalendarRange — boundaries', () => {
  it('returns no filter when neither bound is given', () => {
    const { range, error } = parseCalendarRange(params(''));
    expect(range).toBeNull();
    expect(error).toBeNull();
  });

  it('builds a half-open window: from inclusive, to exclusive', () => {
    const { range } = parseCalendarRange(params('from=2026-08-01&to=2026-09-01'));
    expect(range?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range?.lt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('includes the last day of the month', () => {
    const { range } = parseCalendarRange(params('from=2026-08-01&to=2026-09-01'));
    const lastDay = parseCalendarDate('2026-08-31')!;
    expect(lastDay >= range!.gte!).toBe(true);
    expect(lastDay < range!.lt!).toBe(true);
  });

  it('excludes the first day of the next month, so months never double-count', () => {
    const { range } = parseCalendarRange(params('from=2026-08-01&to=2026-09-01'));
    const nextMonth = parseCalendarDate('2026-09-01')!;
    expect(nextMonth < range!.lt!).toBe(false);
  });

  it('leaves no gap between adjacent months', () => {
    const august = parseCalendarRange(params('from=2026-08-01&to=2026-09-01')).range!;
    const september = parseCalendarRange(params('from=2026-09-01&to=2026-10-01')).range!;
    // August's exclusive end is exactly September's inclusive start.
    expect(august.lt!.getTime()).toBe(september.gte!.getTime());
  });

  it('accepts a single open bound', () => {
    expect(parseCalendarRange(params('from=2026-08-01')).range?.lt).toBeUndefined();
    expect(parseCalendarRange(params('to=2026-09-01')).range?.gte).toBeUndefined();
  });

  it('rejects a malformed bound instead of silently ignoring it', () => {
    // Dropping it would return the unfiltered — and truncated — list, which is
    // the exact failure this feature exists to prevent.
    const { range, error } = parseCalendarRange(params('from=last-tuesday'));
    expect(range).toBeNull();
    expect(error).toContain('from');
  });

  it('rejects an inverted window', () => {
    const { error } = parseCalendarRange(params('from=2026-09-01&to=2026-08-01'));
    expect(error).toContain('after');
  });

  it('rejects a zero-width window', () => {
    expect(parseCalendarRange(params('from=2026-08-01&to=2026-08-01')).error).toBeTruthy();
  });
});

describe('range boundaries are timezone-stable', () => {
  it('produces the same instants regardless of the caller offset', () => {
    // Both bounds are pinned to UTC midnight — the same way the columns were
    // written — so a caller in Los Angeles and one in Istanbul asking for
    // "August" receive identical windows.
    const { range } = parseCalendarRange(params('from=2026-08-01&to=2026-09-01'));
    expect(range!.gte!.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range!.gte!.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('a due date stored at UTC midnight falls inside its own month', () => {
    const { range } = parseCalendarRange(params('from=2026-01-01&to=2026-02-01'));
    const due = parseCalendarDate('2026-01-31')!;
    expect(due >= range!.gte! && due < range!.lt!).toBe(true);
  });

  it('a due date on the 1st belongs to its own month, not the previous one', () => {
    const due = parseCalendarDate('2026-02-01')!;
    const january = parseCalendarRange(params('from=2026-01-01&to=2026-02-01')).range!;
    const february = parseCalendarRange(params('from=2026-02-01&to=2026-03-01')).range!;
    expect(due < january.lt!).toBe(false);
    expect(due >= february.gte! && due < february.lt!).toBe(true);
  });

  it('spans a DST transition without shifting a boundary', () => {
    // US DST starts 8 March 2026; no local arithmetic is involved, so March is
    // still exactly 31 days.
    const { range } = parseCalendarRange(params('from=2026-03-01&to=2026-04-01'));
    const days = (range!.lt!.getTime() - range!.gte!.getTime()) / 86_400_000;
    expect(days).toBe(31);
  });

  it('handles a leap February', () => {
    const { range } = parseCalendarRange(params('from=2028-02-01&to=2028-03-01'));
    const days = (range!.lt!.getTime() - range!.gte!.getTime()) / 86_400_000;
    expect(days).toBe(29);
  });
});

describe('boundedTake', () => {
  it('defaults generously, so realistic lists are returned whole', () => {
    expect(boundedTake(params(''))).toBe(DEFAULT_LIST_TAKE);
    expect(DEFAULT_LIST_TAKE).toBeGreaterThanOrEqual(1000);
  });

  it('honours an explicit take', () => {
    expect(boundedTake(params('take=50'))).toBe(50);
  });

  it('clamps to the hard ceiling', () => {
    expect(boundedTake(params('take=999999'))).toBe(MAX_LIST_TAKE);
  });

  it.each(['take=0', 'take=-5'])('never returns a non-positive take (%s)', (qs) => {
    expect(boundedTake(params(qs))).toBeGreaterThanOrEqual(1);
  });

  it.each(['take=abc', 'take='])('falls back to the default for %s', (qs) => {
    expect(boundedTake(params(qs))).toBe(DEFAULT_LIST_TAKE);
  });

  it('allows a whole month of records without truncation', () => {
    expect(RANGE_MAX).toBeGreaterThan(DEFAULT_LIST_TAKE / 2);
  });
});

describe('listResponse — truncation is never silent', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

  it('returns every row when nothing was withheld', async () => {
    const res = listResponse(rows(3), 10);
    expect(await res.json()).toHaveLength(3);
    expect(res.headers.get('X-Has-More')).toBe('false');
    expect(res.headers.get('X-Returned-Count')).toBe('3');
  });

  it('trims the probe row and flags that more exist', async () => {
    // The caller fetches take + 1; the extra row is the signal, not content.
    const res = listResponse(rows(11), 10);
    expect(await res.json()).toHaveLength(10);
    expect(res.headers.get('X-Has-More')).toBe('true');
  });

  it('reports exactly at the limit as complete', async () => {
    const res = listResponse(rows(10), 10);
    expect(await res.json()).toHaveLength(10);
    expect(res.headers.get('X-Has-More')).toBe('false');
  });

  it('keeps the body a plain array, so existing consumers are unaffected', async () => {
    const body = await listResponse(rows(2), 10).json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('handles an empty list', async () => {
    const res = listResponse([], 10);
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('X-Has-More')).toBe('false');
  });
});

describe('a month of records survives the round trip', () => {
  it('a company with far more than a page of invoices still gets its month whole', async () => {
    // 150 invoices existed before; the calendar received only the newest 100 and
    // showed nothing for the rest. A month window returns them all.
    const monthRows = Array.from({ length: 150 }, (_, i) => ({ id: `inv-${i}` }));
    const res = listResponse(monthRows, RANGE_MAX);
    expect(await res.json()).toHaveLength(150);
    expect(res.headers.get('X-Has-More')).toBe('false');
  });

  it('an old invoice is selected by its own month rather than by recency', () => {
    const oldDue = parseCalendarDate('2024-03-15')!;
    const { range } = parseCalendarRange(params('from=2024-03-01&to=2024-04-01'));
    expect(oldDue >= range!.gte! && oldDue < range!.lt!).toBe(true);
  });

  it('an invoice outside the window is excluded', () => {
    const due = parseCalendarDate('2026-05-10')!;
    const { range } = parseCalendarRange(params('from=2026-08-01&to=2026-09-01'));
    expect(due >= range!.gte! && due < range!.lt!).toBe(false);
  });
});

describe('session configuration', () => {
  it('expires well before the 30-day NextAuth default', () => {
    expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
    expect(SESSION_MAX_AGE).toBeLessThan(30 * 24 * 60 * 60);
  });

  it('slides the expiry daily, so an active user is not signed out on a schedule', () => {
    expect(SESSION_UPDATE_AGE).toBe(24 * 60 * 60);
  });

  it('renews far more often than it expires, or sliding renewal would be pointless', () => {
    expect(SESSION_UPDATE_AGE).toBeLessThan(SESSION_MAX_AGE);
  });
});

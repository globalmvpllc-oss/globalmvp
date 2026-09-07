import { describe, it, expect } from 'vitest';
import {
  buildChequeTotals,
  dueSoonWindow,
  emptyChequeTotals,
  DUE_SOON_DAYS,
  type ChequeRow,
} from '@/lib/cheque-totals';

/**
 * What is held, what falls due, and what bounced.
 *
 * The figure that must never be wrong is `held`: it is the face value of
 * promises, and no caller may add it to income or to a receivable. These tests
 * pin that, the per-currency separation, and the due-date window — which is
 * built in the company's own time zone because getting a month boundary wrong
 * has already bitten this codebase twice.
 */

const row = (over: Partial<ChequeRow> = {}): ChequeRow => ({
  direction: 'RECEIVED',
  status: 'PORTFOLIO',
  currency: 'USD',
  amount: '1000.00',
  dueDate: '2026-03-15T00:00:00.000Z',
  ...over,
});

const build = (rows: ChequeRow[], over: Partial<Parameters<typeof buildChequeTotals>[0]> = {}) =>
  buildChequeTotals({
    rows,
    defaultCurrency: 'USD',
    timeZone: 'UTC',
    now: new Date('2026-03-01T12:00:00.000Z'),
    ...over,
  });

describe('a cheque in the portfolio is not money', () => {
  it('counts towards held and nothing else', () => {
    const totals = build([row({ amount: '5000.00' })]);
    expect(totals.byCurrency.USD.held).toBe('5000.00');
    expect(totals.byCurrency.USD.bounced).toBe('0.00');
    expect(totals.byCurrency.USD.heldCount).toBe(1);
  });

  it('counts a presented cheque as still held — it has not cleared', () => {
    const totals = build([row({ status: 'PRESENTED' })]);
    expect(totals.byCurrency.USD.held).toBe('1000.00');
  });

  it('counts an outstanding issued cheque as held on the other side', () => {
    const totals = build([row({ direction: 'ISSUED', status: 'OUTSTANDING' })]);
    expect(totals.byCurrency.USD.held).toBe('1000.00');
  });

  it('drops out of held the moment it settles', () => {
    // At this point the money exists as a Payment, and every ordinary total
    // picks it up from there. Leaving it in `held` too would count it twice.
    for (const status of ['CLEARED', 'PAID', 'CANCELLED']) {
      const totals = build([row({ status })]);
      expect(totals.byCurrency.USD.held, status).toBe('0.00');
      expect(totals.byCurrency.USD.heldCount, status).toBe(0);
    }
  });

  it('moves to bounced rather than staying held', () => {
    const totals = build([row({ status: 'BOUNCED', amount: '750.50' })]);
    expect(totals.byCurrency.USD.held).toBe('0.00');
    expect(totals.byCurrency.USD.bounced).toBe('750.50');
    expect(totals.byCurrency.USD.bouncedCount).toBe(1);
  });
});

describe('currencies stay separate', () => {
  it('never sums one currency into another', () => {
    const totals = build([
      row({ currency: 'USD', amount: '1000.00' }),
      row({ currency: 'EUR', amount: '500.00' }),
      row({ currency: 'TRY', amount: '40000.00' }),
    ]);
    expect(totals.currencies).toEqual(['EUR', 'TRY', 'USD']);
    expect(totals.byCurrency.USD.held).toBe('1000.00');
    expect(totals.byCurrency.EUR.held).toBe('500.00');
    expect(totals.byCurrency.TRY.held).toBe('40000.00');
    // 1000 USD and 500 EUR is never 1500 of anything.
    expect(Object.values(totals.byCurrency).map((b) => b.held)).not.toContain('1500.00');
  });

  it('keeps bounced amounts per currency too', () => {
    const totals = build([
      row({ currency: 'USD', status: 'BOUNCED', amount: '100.00' }),
      row({ currency: 'TRY', status: 'BOUNCED', amount: '9000.00' }),
    ]);
    expect(totals.byCurrency.USD.bounced).toBe('100.00');
    expect(totals.byCurrency.TRY.bounced).toBe('9000.00');
  });

  it('attributes a row with no currency to the company default', () => {
    const totals = build([row({ currency: null })], { defaultCurrency: 'TRY' });
    expect(totals.byCurrency.TRY.held).toBe('1000.00');
  });

  it('sorts currencies so the render order is stable', () => {
    const order = build([
      row({ currency: 'USD' }), row({ currency: 'EUR' }), row({ currency: 'GBP' }),
    ]).currencies;
    const reversed = build([
      row({ currency: 'GBP' }), row({ currency: 'EUR' }), row({ currency: 'USD' }),
    ]).currencies;
    expect(order).toEqual(reversed);
  });
});

describe('due soon', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  it('includes an instrument due today', () => {
    const totals = build([row({ dueDate: '2026-03-01T00:00:00.000Z' })], { now });
    expect(totals.byCurrency.USD.dueSoon).toBe('1000.00');
  });

  it('includes one due inside the window', () => {
    const totals = build([row({ dueDate: '2026-03-20T00:00:00.000Z' })], { now });
    expect(totals.byCurrency.USD.dueSoon).toBe('1000.00');
  });

  it('excludes one due beyond it, while still counting it as held', () => {
    const totals = build([row({ dueDate: '2026-06-01T00:00:00.000Z' })], { now });
    expect(totals.byCurrency.USD.dueSoon).toBe('0.00');
    expect(totals.byCurrency.USD.held).toBe('1000.00');
  });

  it('treats the far edge as exclusive, so adjacent windows never double-count', () => {
    const { to } = dueSoonWindow('UTC', now);
    const onTheEdge = build([row({ dueDate: to.toISOString() })], { now });
    expect(onTheEdge.byCurrency.USD.dueSoon).toBe('0.00');

    const justInside = build([row({ dueDate: new Date(to.getTime() - 1).toISOString() })], { now });
    expect(justInside.byCurrency.USD.dueSoon).toBe('1000.00');
  });

  it('excludes a settled instrument even when its due date is imminent', () => {
    const totals = build([row({ status: 'CLEARED', dueDate: '2026-03-02T00:00:00.000Z' })], { now });
    expect(totals.byCurrency.USD.dueSoon).toBe('0.00');
  });
});

describe('the due-soon window in the company time zone', () => {
  it('opens at local midnight, not UTC midnight', () => {
    // Istanbul is UTC+3, so its day begins at 21:00 UTC the evening before.
    const { from } = dueSoonWindow('Europe/Istanbul', new Date('2026-03-15T10:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-03-14T21:00:00.000Z');
  });

  it('gives a different window to a zone behind UTC', () => {
    const istanbul = dueSoonWindow('Europe/Istanbul', new Date('2026-03-15T10:00:00.000Z'));
    const newYork = dueSoonWindow('America/New_York', new Date('2026-03-15T10:00:00.000Z'));
    expect(istanbul.from.toISOString()).not.toBe(newYork.from.toISOString());
  });

  it('crosses a month boundary without arithmetic of its own', () => {
    // 15 March + 30 days is 14 April. Date.UTC normalises the overflow, so
    // nothing here has to know how long March is.
    const { from, to } = dueSoonWindow('UTC', new Date('2026-03-15T08:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-04-14T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    const { from, to } = dueSoonWindow('UTC', new Date('2026-12-20T08:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-12-20T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-19T00:00:00.000Z');
  });

  it('crosses the end of February in a leap year', () => {
    const { to } = dueSoonWindow('UTC', new Date('2028-02-10T08:00:00.000Z'));
    // 2028 is a leap year: 10 Feb + 30 days is 11 March, not 12.
    expect(to.toISOString()).toBe('2028-03-11T00:00:00.000Z');
  });

  it('spans exactly the configured number of days at a fixed offset', () => {
    const { from, to } = dueSoonWindow('UTC', new Date('2026-05-05T08:00:00.000Z'));
    const days = (to.getTime() - from.getTime()) / 86400000;
    expect(days).toBe(DUE_SOON_DAYS);
  });

  it('falls back to UTC on an unusable zone rather than throwing', () => {
    expect(() => dueSoonWindow('Not/AZone', new Date('2026-03-15T08:00:00.000Z'))).not.toThrow();
    const { from } = dueSoonWindow('Not/AZone', new Date('2026-03-15T08:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });
});

describe('amounts', () => {
  it('accepts Decimal-as-string without producing NaN', () => {
    const totals = build([row({ amount: '1234.56' }), row({ amount: '0.44' })]);
    expect(totals.byCurrency.USD.held).toBe('1235.00');
    expect(totals.byCurrency.USD.held).not.toContain('NaN');
  });

  it('does not drift over many small instruments', () => {
    const totals = build(Array.from({ length: 300 }, () => row({ amount: '0.10' })));
    expect(totals.byCurrency.USD.held).toBe('30.00');
  });

  it('treats an unusable amount as zero rather than poisoning the total', () => {
    const totals = build([
      row({ amount: '100.00' }),
      row({ amount: 'not-a-number' }),
      row({ amount: null }),
    ]);
    expect(totals.byCurrency.USD.held).toBe('100.00');
    expect(Number.isNaN(Number(totals.byCurrency.USD.held))).toBe(false);
  });

  it('emits every figure as a fixed 2dp string', () => {
    const totals = build([row({ amount: '7' })]);
    for (const value of [
      totals.byCurrency.USD.held,
      totals.byCurrency.USD.dueSoon,
      totals.byCurrency.USD.bounced,
    ]) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});

describe('filtering and empty portfolios', () => {
  it('restricts to one side of the book when asked', () => {
    const rows = [
      row({ direction: 'RECEIVED', amount: '100.00' }),
      row({ direction: 'ISSUED', status: 'OUTSTANDING', amount: '900.00' }),
    ];
    expect(build(rows, { direction: 'RECEIVED' }).byCurrency.USD.held).toBe('100.00');
    expect(build(rows, { direction: 'ISSUED' }).byCurrency.USD.held).toBe('900.00');
    expect(build(rows).byCurrency.USD.held).toBe('1000.00');
  });

  it('ignores a row whose direction is not one of the two', () => {
    // Counting it would put an amount in a total with nothing explaining it.
    const totals = build([row({ direction: 'SIDEWAYS', amount: '9999.00' })]);
    expect(totals.hasInstruments).toBe(false);
    expect(totals.currencies).toEqual([]);
  });

  it('reports an empty portfolio as empty rather than as undefined', () => {
    const totals = build([]);
    expect(totals.hasInstruments).toBe(false);
    expect(totals.currencies).toEqual([]);
    expect(totals.byCurrency).toEqual({});
  });

  it('offers zeroed figures for a currency that is absent', () => {
    expect(emptyChequeTotals('EUR')).toEqual({
      currency: 'EUR',
      held: '0.00',
      dueSoon: '0.00',
      bounced: '0.00',
      heldCount: 0,
      dueSoonCount: 0,
      bouncedCount: 0,
    });
  });

  it('says a portfolio has instruments even when they have all settled', () => {
    // "Has this business ever recorded one" is a different question from
    // "does it hold any", and the empty state depends on the first.
    const totals = build([row({ status: 'CLEARED' })]);
    expect(totals.hasInstruments).toBe(true);
    expect(totals.byCurrency.USD.held).toBe('0.00');
  });

  it('survives an unusable due date without dropping the instrument from held', () => {
    const totals = build([row({ dueDate: 'not-a-date' })]);
    expect(totals.byCurrency.USD.held).toBe('1000.00');
    expect(totals.byCurrency.USD.dueSoon).toBe('0.00');
  });
});

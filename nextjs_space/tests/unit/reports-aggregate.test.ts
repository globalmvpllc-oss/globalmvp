import { describe, it, expect } from 'vitest';
import {
  buildReport,
  emptyTotals,
  monthKeyOf,
  monthLabel,
  monthSpine,
  MAX_MONTHS,
  type ReportsInput,
} from '@/lib/reports-aggregate';
import { parseCalendarRange } from '@/lib/calendar-range';

/**
 * Reports aggregation.
 *
 * The defect these guard: the reports page fetched three paginated lists and
 * added them up in the browser, so a company with more records than a page
 * could hold saw totals computed from a partial list — a finance product giving
 * a wrong answer rather than no answer. Postgres now does the summing; this
 * module shapes the result, and these tests pin the arithmetic without needing
 * a database.
 */

/** A report input with nothing in it, for tests to override one field at a time. */
const base = (over: Partial<ReportsInput> = {}): ReportsInput => ({
  income: [],
  expenses: [],
  expenseCategories: [],
  invoices: [],
  invoiceStatuses: [],
  hasRecords: true,
  defaultCurrency: 'USD',
  ...over,
});

describe('currency separation', () => {
  it('never adds one currency into another', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2026-03-10', amount: '100.00' },
        { currency: 'EUR', date: '2026-03-11', amount: '250.00' },
        { currency: 'TRY', date: '2026-03-12', amount: '4000.00' },
      ],
    }));

    expect(report.currencies).toEqual(['EUR', 'TRY', 'USD']);
    expect(report.byCurrency.USD.income).toBe('100.00');
    expect(report.byCurrency.EUR.income).toBe('250.00');
    expect(report.byCurrency.TRY.income).toBe('4000.00');

    // The sum of everything, 4350, must appear nowhere.
    const everyFigure = Object.values(report.byCurrency).flatMap((t) => Object.values(t));
    expect(everyFigure).not.toContain('4350.00');
  });

  it('keeps invoiced and collected separate per currency', () => {
    const report = buildReport(base({
      invoices: [
        { currency: 'USD', total: '1000.00', amountPaid: '400.00' },
        { currency: 'EUR', total: '600.00', amountPaid: '600.00' },
      ],
    }));

    expect(report.byCurrency.USD).toMatchObject({
      invoiced: '1000.00', collected: '400.00', outstanding: '600.00',
    });
    expect(report.byCurrency.EUR).toMatchObject({
      invoiced: '600.00', collected: '600.00', outstanding: '0.00',
    });
  });

  it('attributes a row with no currency to the company default', () => {
    const report = buildReport(base({
      defaultCurrency: 'GBP',
      income: [
        { currency: null, date: '2026-03-10', amount: '10.00' },
        { currency: '', date: '2026-03-10', amount: '5.00' },
        { currency: '  ', date: '2026-03-10', amount: '1.00' },
      ],
    }));

    expect(report.currencies).toEqual(['GBP']);
    expect(report.byCurrency.GBP.income).toBe('16.00');
  });

  it('groups expense categories per currency rather than pooling them', () => {
    const report = buildReport(base({
      expenseCategories: [
        { currency: 'USD', category: 'Rent', amount: '900.00' },
        { currency: 'EUR', category: 'Rent', amount: '700.00' },
      ],
    }));

    expect(report.expenseCategories.USD).toEqual([{ name: 'Rent', value: 900 }]);
    expect(report.expenseCategories.EUR).toEqual([{ name: 'Rent', value: 700 }]);
  });
});

describe('decimal-as-string arithmetic', () => {
  it('adds string amounts instead of concatenating them', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2026-01-05', amount: '100.00' },
        { currency: 'USD', date: '2026-01-06', amount: '50.00' },
      ],
    }));

    // The bug this replaces: 0 + "100.00" + "50.00" produced "0100.0050.00".
    expect(report.byCurrency.USD.income).toBe('150.00');
  });

  it('produces no NaN from null, undefined or unparseable amounts', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2026-01-05', amount: null },
        { currency: 'USD', date: '2026-01-05', amount: '12.50' },
        { currency: 'USD', date: '2026-01-05', amount: 'not a number' },
      ],
      invoices: [{ currency: 'USD', total: null, amountPaid: undefined as never }],
    }));

    const figures = Object.values(report.byCurrency.USD);
    expect(figures.some((v) => v.includes('NaN'))).toBe(false);
    expect(report.byCurrency.USD.income).toBe('12.50');
    expect(report.byCurrency.USD.invoiced).toBe('0.00');
  });

  it('adds fractional amounts without floating-point drift', () => {
    const report = buildReport(base({
      expenses: Array.from({ length: 3 }, () => ({
        currency: 'USD' as const, date: '2026-01-05', amount: '0.10',
      })),
    }));

    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in floating point.
    expect(report.byCurrency.USD.expenses).toBe('0.30');
  });

  it('accepts a Prisma Decimal-like object, not just a string', () => {
    const decimalLike = { toString: () => '42.42' };
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-01-05', amount: decimalLike }],
    }));

    expect(report.byCurrency.USD.income).toBe('42.42');
  });
});

describe('profit', () => {
  it('is income minus expenses', () => {
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-01-05', amount: '1000.00' }],
      expenses: [{ currency: 'USD', date: '2026-01-06', amount: '250.00' }],
    }));

    expect(report.byCurrency.USD.profit).toBe('750.00');
  });

  it('equals income when there are no expenses', () => {
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-01-05', amount: '80.00' }],
    }));

    expect(report.byCurrency.USD).toMatchObject({ expenses: '0.00', profit: '80.00' });
  });

  it('goes negative when expenses exceed income', () => {
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-01-05', amount: '100.00' }],
      expenses: [{ currency: 'USD', date: '2026-01-05', amount: '175.50' }],
    }));

    expect(report.byCurrency.USD.profit).toBe('-75.50');
  });

  it('is zero, not undefined, when both sides are zero', () => {
    const report = buildReport(base({
      invoices: [{ currency: 'USD', total: '10.00', amountPaid: '0.00' }],
    }));

    expect(report.byCurrency.USD.profit).toBe('0.00');
  });
});

describe('outstanding', () => {
  it('is invoiced minus collected', () => {
    const report = buildReport(base({
      invoices: [{ currency: 'USD', total: '500.00', amountPaid: '125.00' }],
    }));

    expect(report.byCurrency.USD.outstanding).toBe('375.00');
  });

  it('is zero when everything has been collected', () => {
    const report = buildReport(base({
      invoices: [{ currency: 'USD', total: '500.00', amountPaid: '500.00' }],
    }));

    expect(report.byCurrency.USD.outstanding).toBe('0.00');
  });

  it('reports over-collection as negative rather than clamping it away', () => {
    // A duplicated payment is a real condition worth investigating. Clamping at
    // zero here would make an over-collected ledger look settled.
    const report = buildReport(base({
      invoices: [{ currency: 'USD', total: '100.00', amountPaid: '150.00' }],
    }));

    expect(report.byCurrency.USD.outstanding).toBe('-50.00');
  });
});

describe('a company with no records', () => {
  const report = buildReport(base({ hasRecords: false, defaultCurrency: 'TRY' }));

  it('answers in its own currency with zeros, not an empty object', () => {
    expect(report.currencies).toEqual(['TRY']);
    expect(report.byCurrency.TRY).toEqual(emptyTotals());
  });

  it('has no undefined or NaN anywhere in the totals', () => {
    for (const value of Object.values(report.byCurrency.TRY)) {
      expect(value).toBeTypeOf('string');
      expect(value).toBe('0.00');
    }
  });

  it('reports hasRecords false so the page shows its empty state', () => {
    expect(report.hasRecords).toBe(false);
    expect(report.monthly.TRY).toEqual([]);
    expect(report.expenseCategories.TRY).toEqual([]);
    expect(report.invoiceStatusCounts).toEqual([]);
  });

  it('separates "no records at all" from "records but nothing received"', () => {
    // Only EXPECTED income exists: nothing is summed, but the company has
    // records, so the page must show zeroed cards rather than "nothing yet".
    const withRecords = buildReport(base({ hasRecords: true }));
    expect(withRecords.hasRecords).toBe(true);
    expect(withRecords.byCurrency.USD).toEqual(emptyTotals());
  });
});

describe('monthly series', () => {
  it('fills a month with no activity as zero rather than omitting it', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2026-01-15', amount: '100.00' },
        // Nothing in February.
        { currency: 'USD', date: '2026-03-15', amount: '300.00' },
      ],
    }));

    expect(report.monthly.USD.map((p) => p.monthKey)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(report.monthly.USD[1]).toMatchObject({ month: 'Feb 26', income: 0, expenses: 0 });
  });

  it('sums several days into one month', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2026-01-02', amount: '10.00' },
        { currency: 'USD', date: '2026-01-20', amount: '15.00' },
      ],
      expenses: [{ currency: 'USD', date: '2026-01-09', amount: '4.00' }],
    }));

    expect(report.monthly.USD).toEqual([
      { monthKey: '2026-01', month: 'Jan 26', income: 25, expenses: 4 },
    ]);
  });

  it('spans a year boundary without a gap', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: '2025-11-01', amount: '1.00' },
        { currency: 'USD', date: '2026-02-01', amount: '1.00' },
      ],
    }));

    expect(report.monthly.USD.map((p) => p.monthKey)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });

  it('keeps each currency on its own series', () => {
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-01-15', amount: '100.00' }],
      expenses: [{ currency: 'EUR', date: '2026-01-15', amount: '70.00' }],
    }));

    expect(report.monthly.USD).toEqual([{ monthKey: '2026-01', month: 'Jan 26', income: 100, expenses: 0 }]);
    expect(report.monthly.EUR).toEqual([{ monthKey: '2026-01', month: 'Jan 26', income: 0, expenses: 70 }]);
  });

  it('buckets a UTC-midnight date into its own month, not the previous one', () => {
    // The browser-side chart formatted with local time, so 2026-08-01T00:00Z
    // landed in July for any viewer west of Greenwich.
    expect(monthKeyOf(new Date('2026-08-01T00:00:00.000Z'))).toBe('2026-08');
    expect(monthKeyOf(new Date('2026-08-31T23:59:59.999Z'))).toBe('2026-08');
  });

  it('ignores an unparseable date instead of producing an Invalid Date bucket', () => {
    const report = buildReport(base({
      income: [
        { currency: 'USD', date: 'nonsense', amount: '50.00' },
        { currency: 'USD', date: '2026-01-10', amount: '10.00' },
      ],
    }));

    // The amount still counts towards the total; only its month is unknown.
    expect(report.byCurrency.USD.income).toBe('60.00');
    expect(report.monthly.USD).toEqual([{ monthKey: '2026-01', month: 'Jan 26', income: 10, expenses: 0 }]);
    expect(monthKeyOf('nonsense')).toBeNull();
  });

  it('uses an explicit window so a requested empty month is still drawn', () => {
    const report = buildReport(base({
      income: [{ currency: 'USD', date: '2026-02-10', amount: '20.00' }],
      window: { startKey: '2026-01', endKey: '2026-04' },
    }));

    expect(report.monthly.USD.map((p) => p.monthKey)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04',
    ]);
    expect(report.monthly.USD.map((p) => p.income)).toEqual([0, 20, 0, 0]);
  });
});

describe('monthSpine', () => {
  it('returns a single month when both bounds are the same', () => {
    expect(monthSpine('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('returns nothing when the end precedes the start', () => {
    expect(monthSpine('2026-05', '2026-04')).toEqual([]);
  });

  it('rejects a malformed bound rather than looping', () => {
    expect(monthSpine('not-a-month', '2026-04')).toEqual([]);
    expect(monthSpine('2026-05', 'nope')).toEqual([]);
    expect(monthSpine('2026-13', '2026-14')).toEqual([]);
  });

  it('caps a very long span at the most recent MAX_MONTHS', () => {
    const spine = monthSpine('2000-01', '2026-12');
    expect(spine).toHaveLength(MAX_MONTHS);
    expect(spine[spine.length - 1]).toBe('2026-12');
  });

  it('labels a month the way the chart axis expects', () => {
    expect(monthLabel('2026-08')).toBe('Aug 26');
    expect(monthLabel('2025-01')).toBe('Jan 25');
    expect(monthLabel('2026-12')).toBe('Dec 26');
  });
});

describe('expense categories and invoice statuses', () => {
  it('labels an uncategorised expense Other', () => {
    const report = buildReport(base({
      expenseCategories: [
        { currency: 'USD', category: null, amount: '5.00' },
        { currency: 'USD', category: '   ', amount: '5.00' },
      ],
    }));

    expect(report.expenseCategories.USD).toEqual([{ name: 'Other', value: 10 }]);
  });

  it('orders slices largest first so the pie is stable between renders', () => {
    const report = buildReport(base({
      expenseCategories: [
        { currency: 'USD', category: 'Software', amount: '10.00' },
        { currency: 'USD', category: 'Rent', amount: '900.00' },
        { currency: 'USD', category: 'Travel', amount: '80.00' },
      ],
    }));

    expect(report.expenseCategories.USD.map((s) => s.name)).toEqual(['Rent', 'Travel', 'Software']);
  });

  it('gives a currency seen only in expenses its own zeroed totals', () => {
    const report = buildReport(base({
      expenseCategories: [{ currency: 'EUR', category: 'Rent', amount: '100.00' }],
    }));

    // The pie must never be drawn for a currency the cards do not cover.
    expect(report.currencies).toContain('EUR');
    expect(report.byCurrency.EUR.income).toBe('0.00');
  });

  it('counts invoice statuses, largest first, and drops empty ones', () => {
    const report = buildReport(base({
      invoiceStatuses: [
        { status: 'PAID', count: 3 },
        { status: 'DRAFT', count: 7 },
        { status: 'OVERDUE', count: 0 },
      ],
    }));

    expect(report.invoiceStatusCounts).toEqual([
      { name: 'DRAFT', value: 7 },
      { name: 'PAID', value: 3 },
    ]);
  });

  it('folds a status-less invoice into DRAFT rather than beside it', () => {
    const report = buildReport(base({
      invoiceStatuses: [
        { status: 'DRAFT', count: 7 },
        { status: null, count: 1 },
      ],
    }));

    // Two slices both labelled DRAFT would draw as two wedges of one thing.
    expect(report.invoiceStatusCounts).toEqual([{ name: 'DRAFT', value: 8 }]);
  });
});

describe('date range parsing at the endpoint boundary', () => {
  const params = (qs: string) => new URLSearchParams(qs);

  it('falls back to the full range when no bound is given', () => {
    const { range, error } = parseCalendarRange(params(''));
    expect(range).toBeNull();
    expect(error).toBeNull();
  });

  it('returns an error rather than throwing on a malformed bound', () => {
    expect(() => parseCalendarRange(params('from=not-a-date'))).not.toThrow();
    const { range, error } = parseCalendarRange(params('from=not-a-date'));
    expect(range).toBeNull();
    expect(error).toBeTruthy();
  });

  it('returns an error when the range is inverted', () => {
    const { range, error } = parseCalendarRange(params('from=2026-09-01&to=2026-08-01'));
    expect(range).toBeNull();
    expect(error).toBeTruthy();
  });

  it('turns a valid half-open range into the window the chart spans', () => {
    const { range, error } = parseCalendarRange(params('from=2026-01-01&to=2026-04-01'));
    expect(error).toBeNull();

    // `to` is exclusive, so the last month included is March, not April.
    const startKey = monthKeyOf(range!.gte!);
    const endKey = monthKeyOf(new Date(range!.lt!.getTime() - 1));
    expect(startKey).toBe('2026-01');
    expect(endKey).toBe('2026-03');
    expect(monthSpine(startKey!, endKey!)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

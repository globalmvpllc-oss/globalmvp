import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { buildReport, emptyTotals, type ReportsInput } from '@/lib/reports-aggregate';

/**
 * One definition of "expenses" across the reports page.
 *
 * The "Total Expenses" card and the monthly series counted PAID; the
 * expense-by-category pie counted every status. A company with unpaid bills saw
 * a pie whose slices added up to more than the total printed above it, with
 * nothing on the page to explain the gap.
 *
 * Everything now counts PAID. What is recorded but unpaid is carried separately
 * and named beside the pie — a pointer, never a figure to be added to anything.
 *
 * The property these tests exist to hold: **for any currency, the slices sum to
 * that currency's total.** That is what a reader checks by eye, and it is the
 * one thing the page must never get wrong again.
 */

const base = (over: Partial<ReportsInput> = {}): ReportsInput => ({
  income: [],
  expenses: [],
  expenseCategories: [],
  unpaidExpenses: [],
  invoices: [],
  invoiceStatuses: [],
  hasRecords: true,
  defaultCurrency: 'USD',
  ...over,
});

/** The sum a reader gets by adding the slices of one pie. */
function sliceTotal(report: ReturnType<typeof buildReport>, currency: string): string {
  return (report.expenseCategories[currency] ?? [])
    .reduce((sum, slice) => sum.plus(new Decimal(slice.value)), new Decimal(0))
    .toFixed(2);
}

describe('an unpaid expense', () => {
  /**
   * The route feeds `expenses` and `expenseCategories` from PAID rows and
   * `unpaidExpenses` from UNPAID rows. These inputs are what that produces for
   * one paid bill and one unpaid one.
   */
  const withOneOfEach = base({
    expenses: [{ currency: 'USD', date: '2026-03-10', amount: '300.00' }],
    expenseCategories: [{ currency: 'USD', category: 'Rent', amount: '300.00' }],
    unpaidExpenses: [{ currency: 'USD', amount: '900.00' }],
  });

  it('stays out of the total, as it always did', () => {
    expect(buildReport(withOneOfEach).byCurrency.USD.expenses).toBe('300.00');
  });

  it('stays out of the pie, which it did not before', () => {
    const report = buildReport(withOneOfEach);
    expect(report.expenseCategories.USD).toEqual([{ name: 'Rent', value: 300 }]);
    expect(sliceTotal(report, 'USD')).toBe('300.00');
  });

  it('is carried separately so the page can name it', () => {
    expect(buildReport(withOneOfEach).byCurrency.USD.unpaidExpenses).toBe('900.00');
  });

  it('is never folded into profit', () => {
    const report = buildReport(
      base({
        income: [{ currency: 'USD', date: '2026-03-01', amount: '1000.00' }],
        expenses: [{ currency: 'USD', date: '2026-03-10', amount: '300.00' }],
        unpaidExpenses: [{ currency: 'USD', amount: '900.00' }],
      })
    );
    // 1000 - 300, not 1000 - 1200. Unpaid money has not left the business.
    expect(report.byCurrency.USD.profit).toBe('700.00');
  });
});

describe('the slices reconcile with the total beside them', () => {
  it('holds for a single currency', () => {
    const report = buildReport(
      base({
        expenses: [
          { currency: 'USD', date: '2026-03-01', amount: '300.00' },
          { currency: 'USD', date: '2026-03-05', amount: '120.50' },
        ],
        expenseCategories: [
          { currency: 'USD', category: 'Rent', amount: '300.00' },
          { currency: 'USD', category: 'Software', amount: '120.50' },
        ],
        unpaidExpenses: [{ currency: 'USD', amount: '5000.00' }],
      })
    );
    expect(sliceTotal(report, 'USD')).toBe(report.byCurrency.USD.expenses);
    expect(report.byCurrency.USD.expenses).toBe('420.50');
  });

  it('holds for every currency independently', () => {
    const report = buildReport(
      base({
        expenses: [
          { currency: 'USD', date: '2026-03-01', amount: '300.00' },
          { currency: 'EUR', date: '2026-03-01', amount: '700.00' },
          { currency: 'TRY', date: '2026-03-01', amount: '4500.00' },
        ],
        expenseCategories: [
          { currency: 'USD', category: 'Rent', amount: '200.00' },
          { currency: 'USD', category: 'Travel', amount: '100.00' },
          { currency: 'EUR', category: 'Rent', amount: '700.00' },
          { currency: 'TRY', category: 'Software', amount: '4500.00' },
        ],
        unpaidExpenses: [
          { currency: 'USD', amount: '10.00' },
          { currency: 'EUR', amount: '20.00' },
        ],
      })
    );

    for (const currency of ['USD', 'EUR', 'TRY']) {
      expect(sliceTotal(report, currency), currency).toBe(
        report.byCurrency[currency].expenses
      );
    }
  });

  it('does not drift over many small amounts', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      currency: 'USD',
      category: `Cat${i % 7}`,
      amount: '0.10',
    }));
    const report = buildReport(
      base({
        expenses: rows.map((r, i) => ({
          currency: r.currency,
          date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
          amount: r.amount,
        })),
        expenseCategories: rows,
      })
    );
    expect(report.byCurrency.USD.expenses).toBe('30.00');
    expect(sliceTotal(report, 'USD')).toBe('30.00');
  });
});

describe('currencies stay separate', () => {
  it('never merges two currencies into one pie', () => {
    const report = buildReport(
      base({
        expenseCategories: [
          { currency: 'USD', category: 'Rent', amount: '100.00' },
          { currency: 'EUR', category: 'Rent', amount: '900.00' },
        ],
      })
    );
    expect(report.expenseCategories.USD).toEqual([{ name: 'Rent', value: 100 }]);
    expect(report.expenseCategories.EUR).toEqual([{ name: 'Rent', value: 900 }]);
    // 100 USD and 900 EUR is never a 1000 slice of anything.
    expect(sliceTotal(report, 'USD')).toBe('100.00');
    expect(sliceTotal(report, 'EUR')).toBe('900.00');
  });

  it('keeps unpaid amounts per currency too', () => {
    const report = buildReport(
      base({
        unpaidExpenses: [
          { currency: 'USD', amount: '100.00' },
          { currency: 'EUR', amount: '250.00' },
        ],
      })
    );
    expect(report.byCurrency.USD.unpaidExpenses).toBe('100.00');
    expect(report.byCurrency.EUR.unpaidExpenses).toBe('250.00');
  });

  it('attributes an unpaid row with no currency to the company default', () => {
    const report = buildReport(
      base({ defaultCurrency: 'TRY', unpaidExpenses: [{ currency: null, amount: '75.00' }] })
    );
    expect(report.byCurrency.TRY.unpaidExpenses).toBe('75.00');
  });
});

describe('a company with only unpaid expenses', () => {
  const onlyUnpaid = base({
    expenses: [],
    expenseCategories: [],
    unpaidExpenses: [{ currency: 'USD', amount: '1200.00' }],
  });

  it('shows a zero total beside an empty pie, not a full one', () => {
    const report = buildReport(onlyUnpaid);
    expect(report.byCurrency.USD.expenses).toBe('0.00');
    expect(report.expenseCategories.USD).toEqual([]);
    expect(sliceTotal(report, 'USD')).toBe('0.00');
  });

  it('still surfaces the currency, so the page can explain itself', () => {
    // Without this the currency would not appear at all and the page would look
    // as though the company had recorded nothing.
    const report = buildReport(onlyUnpaid);
    expect(report.currencies).toContain('USD');
    expect(report.byCurrency.USD.unpaidExpenses).toBe('1200.00');
  });

  it('leaves a zeroed currency with nothing to explain', () => {
    const report = buildReport(base({ income: [{ currency: 'USD', date: '2026-03-01', amount: '5.00' }] }));
    expect(report.byCurrency.USD.unpaidExpenses).toBe('0.00');
  });
});

describe('what the fix must not have moved', () => {
  it('leaves the PAID-only total exactly as it was', () => {
    const report = buildReport(
      base({
        expenses: [
          { currency: 'USD', date: '2026-03-01', amount: '300.00' },
          { currency: 'USD', date: '2026-04-01', amount: '200.00' },
        ],
        unpaidExpenses: [{ currency: 'USD', amount: '9999.00' }],
      })
    );
    expect(report.byCurrency.USD.expenses).toBe('500.00');
  });

  it('leaves the monthly series counting PAID only', () => {
    const report = buildReport(
      base({
        expenses: [{ currency: 'USD', date: '2026-03-15', amount: '300.00' }],
        unpaidExpenses: [{ currency: 'USD', amount: '9999.00' }],
      })
    );
    const march = report.monthly.USD.find((point) => point.monthKey === '2026-03');
    expect(march?.expenses).toBe(300);
  });

  it('leaves the invoice-status pie counting every status, drafts included', () => {
    const report = buildReport(
      base({
        invoiceStatuses: [
          { status: 'DRAFT', count: 4 },
          { status: 'SENT', count: 1 },
          { status: 'CANCELLED', count: 2 },
        ],
      })
    );
    expect(report.invoiceStatusCounts).toEqual([
      { name: 'DRAFT', value: 4 },
      { name: 'CANCELLED', value: 2 },
      { name: 'SENT', value: 1 },
    ]);
  });

  it('gives an absent currency a zeroed unpaid figure rather than undefined', () => {
    expect(emptyTotals().unpaidExpenses).toBe('0.00');
    expect(emptyTotals()).toHaveProperty('expenses', '0.00');
  });
});

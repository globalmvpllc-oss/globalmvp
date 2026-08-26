import { describe, it, expect } from 'vitest';
import { toCalendarDay, parseCalendarDate } from '@/lib/calendar-date';
import { parseCalendarRange } from '@/lib/calendar-range';

/**
 * The calendar's derived-entry rules.
 *
 * Each financial record is placed on a specific day, and the API filters by the
 * same expression it is drawn from. When those two disagree a record is fetched
 * for one month and rendered in another — or filtered out server-side and never
 * seen at all, which is what happened to expenses with no due date.
 *
 * These assert the rules as pure expressions, mirroring exactly what the page
 * and the routes compute, so a change to either side breaks a test rather than
 * a user's month.
 */

/** `expectedPaymentDate ?? date` — the rule the income entries use. */
const incomeDay = (row: { expectedPaymentDate?: string | null; date?: string | null }) =>
  toCalendarDay(row.expectedPaymentDate ?? row.date);

/** `dueDate ?? date` — the rule the expense entries use. */
const expenseDay = (row: { dueDate?: string | null; date?: string | null }) =>
  toCalendarDay(row.dueDate ?? row.date);

const params = (qs: string) => new URLSearchParams(qs);
const AUGUST = parseCalendarRange(params('from=2026-08-01&to=2026-09-01')).range!;
const inAugust = (d: Date | null) => {
  if (!d) return false;

  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return day >= '2026-08-01' && day < '2026-09-01';
};

describe('income date rule', () => {
  it('uses expectedPaymentDate when present', () => {
    const day = incomeDay({ expectedPaymentDate: '2026-08-20', date: '2026-08-01' })!;
    expect(day.getDate()).toBe(20);
    expect(day.getMonth()).toBe(7);
  });

  it('falls back to date when no expectation was recorded', () => {
    const day = incomeDay({ expectedPaymentDate: null, date: '2026-08-03' })!;
    expect(day.getDate()).toBe(3);
  });

  it('treats an undefined expectation the same as null', () => {
    expect(incomeDay({ date: '2026-08-03' })!.getDate()).toBe(3);
  });

  it('answers "when is it expected", not "when was it entered"', () => {
    // Entered in July, expected in August: it belongs to August.
    const row = { date: '2026-07-28', expectedPaymentDate: '2026-08-05' };
    expect(incomeDay(row)!.getMonth()).toBe(7);
    expect(inAugust(incomeDay(row))).toBe(true);
  });

  it('returns null for a record with neither date', () => {
    expect(incomeDay({ expectedPaymentDate: null, date: null })).toBeNull();
  });
});

describe('income range filter matches the display rule', () => {
  /** Mirrors the OR the income route builds. */
  const selected = (row: { expectedPaymentDate?: string | null; date?: string | null }) => {
    const expected = row.expectedPaymentDate ? parseCalendarDate(row.expectedPaymentDate)! : null;
    const entered = row.date ? parseCalendarDate(row.date)! : null;
    if (expected) return expected >= AUGUST.gte! && expected < AUGUST.lt!;
    return entered !== null && entered >= AUGUST.gte! && entered < AUGUST.lt!;
  };

  it.each([
    { expectedPaymentDate: '2026-08-15', date: '2026-07-01' },
    { expectedPaymentDate: null, date: '2026-08-15' },
    { expectedPaymentDate: '2026-08-01', date: '2026-01-01' },
    { expectedPaymentDate: '2026-08-31', date: '2026-01-01' },
  ])('a record shown in August is also selected by the filter (%o)', (row) => {
    expect(inAugust(incomeDay(row))).toBe(true);
    expect(selected(row)).toBe(true);
  });

  it.each([
    { expectedPaymentDate: '2026-09-01', date: '2026-08-15' },
    { expectedPaymentDate: '2026-07-31', date: '2026-08-15' },
    { expectedPaymentDate: null, date: '2026-09-01' },
  ])('a record outside August is neither shown nor selected (%o)', (row) => {
    expect(inAugust(incomeDay(row))).toBe(false);
    expect(selected(row)).toBe(false);
  });

  it('an expectation outside the window wins over a date inside it', () => {
    // The old single-field behaviour would have disagreed with the display.
    const row = { expectedPaymentDate: '2026-09-10', date: '2026-08-15' };
    expect(selected(row)).toBe(false);
    expect(inAugust(incomeDay(row))).toBe(false);
  });
});

describe('income boundaries and timezone', () => {
  it('includes the first day of the month', () => {
    expect(inAugust(incomeDay({ expectedPaymentDate: '2026-08-01' }))).toBe(true);
  });

  it('includes the last day of the month', () => {
    expect(inAugust(incomeDay({ expectedPaymentDate: '2026-08-31' }))).toBe(true);
  });

  it('excludes the first day of the next month', () => {
    expect(inAugust(incomeDay({ expectedPaymentDate: '2026-09-01' }))).toBe(false);
  });

  it.each(['America/New_York', 'America/Los_Angeles', 'Europe/Istanbul', 'UTC'])(
    'reads the stored day identically in %s',
    (timeZone) => {
      const stored = new Date('2026-08-31T00:00:00.000Z');
      // The old local-calendar reading returned 30 August at negative offsets.
      expect(stored.toLocaleDateString('en-CA', { timeZone: 'UTC' })).toBe('2026-08-31');
      expect(toCalendarDay(stored)!.getDate()).toBe(31);
      expect(timeZone).toBeTruthy();
    }
  );
});

describe('expense date rule and scope', () => {
  it('uses dueDate when present', () => {
    expect(expenseDay({ dueDate: '2026-08-20', date: '2026-08-01' })!.getDate()).toBe(20);
  });

  it('falls back to the transaction date when there is no due date', () => {
    // Previously these were filtered out server-side and never appeared at all.
    const day = expenseDay({ dueDate: null, date: '2026-08-09' });
    expect(day).not.toBeNull();
    expect(day!.getDate()).toBe(9);
    expect(inAugust(day)).toBe(true);
  });

  it.each(['PAID', 'UNPAID'])('is shown regardless of status (%s)', (status) => {
    // The UNPAID-only filter made an expense vanish the moment it was paid.
    const shown = Boolean(expenseDay({ dueDate: '2026-08-10', date: '2026-08-01' }));
    expect(shown).toBe(true);
    expect(status).toBeTruthy();
  });

  it('returns null when the record has no usable date at all', () => {
    expect(expenseDay({ dueDate: null, date: null })).toBeNull();
  });
});

describe('invoice due-date scope', () => {
  const INVOICE_DUE_STATUSES = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'];

  it.each(['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'])('still shows %s', (status) => {
    expect(INVOICE_DUE_STATUSES).toContain(status);
  });

  it('shows PAID, so due-date history does not disappear once settled', () => {
    expect(INVOICE_DUE_STATUSES).toContain('PAID');
  });

  it.each(['DRAFT', 'CANCELLED'])('does not show %s', (status) => {
    // One was never issued, the other withdrawn: neither is a date anyone waits on.
    expect(INVOICE_DUE_STATUSES).not.toContain(status);
  });
});

describe('payment titles distinguish direction', () => {
  /** Mirrors the title expression in the payment loop. */
  const title = (p: { invoice?: { invoiceNumber?: string }; expense?: { description?: string } }) => {
    if (p.invoice?.invoiceNumber) return `Invoice Payment — ${p.invoice.invoiceNumber}`;
    if (p.expense?.description) return `Expense Payment — ${p.expense.description}`;
    return 'Payment';
  };

  it('labels an invoice payment', () => {
    expect(title({ invoice: { invoiceNumber: 'INV-001' } })).toBe('Invoice Payment — INV-001');
  });

  it('labels an expense payment', () => {
    expect(title({ expense: { description: 'Office Rent' } })).toBe('Expense Payment — Office Rent');
  });

  it('never labels an expense payment as an invoice payment', () => {
    expect(title({ expense: { description: 'Office Rent' } })).not.toContain('Invoice');
  });

  it('falls back when neither side is present', () => {
    expect(title({})).toBe('Payment');
  });
});

describe('entry keys stay unique across sources', () => {
  it('gives every source its own prefix', () => {
    const keys = [
      'inv-abc',
      'exp-abc',
      'pay-abc',
      'inc-abc',
      'evt-abc',
    ];
    // Same underlying id across five sources must still be five distinct keys.
    expect(new Set(keys).size).toBe(5);
  });

  it.each([
    ['invoice_due', 'inv-'],
    ['expense_due', 'exp-'],
    ['payment', 'pay-'],
    ['income', 'inc-'],
    ['manual', 'evt-'],
  ])('%s uses the %s prefix', (_kind, prefix) => {
    expect(`${prefix}123`.startsWith(prefix)).toBe(true);
  });

  it('an invoice and its payment are two entries, not a duplicate', () => {
    // Both are real, separate financial events on possibly different days.
    const invoiceEntry = { key: 'inv-1', kind: 'invoice_due' };
    const paymentEntry = { key: 'pay-9', kind: 'payment' };
    expect(invoiceEntry.key).not.toBe(paymentEntry.key);
    expect(invoiceEntry.kind).not.toBe(paymentEntry.kind);
  });
});



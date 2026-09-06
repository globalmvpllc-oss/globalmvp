import Decimal from 'decimal.js';
import type { DecimalLike } from '@/lib/payment-math';

/**
 * Shaping for the reports endpoint — pure, no database access.
 *
 * The reports page used to fetch three paginated lists and reduce them in the
 * browser, so any company past a page limit saw totals computed from a partial
 * list. Every figure is now summed by Postgres; this module only turns those
 * grouped sums into the response the page renders.
 *
 * Kept free of the Prisma client (like payment-math.ts) so the arithmetic can be
 * tested without a live database. The route maps `groupBy` results onto the
 * plain input types below and calls `buildReport`.
 *
 * ## Currency
 *
 * Money is grouped per currency and never summed across currencies. No
 * conversion happens here: 100 USD and 100 EUR are two totals, never 200 of
 * nothing. This matches the dashboard and the rest of the codebase.
 *
 * ## Precision
 *
 * Amounts arrive as Prisma Decimals (or their string form over JSON) and are
 * added with decimal.js, never floating point, then emitted as fixed 2-decimal
 * strings. The client converts once at the display boundary with `toAmount`.
 */

/** A per-currency sum for one date, as returned by a grouped query. */
export interface DatedCurrencySum {
  currency: string | null;
  date: Date | string;
  amount: DecimalLike | null;
}

/** A per-currency sum for one expense category. */
export interface CategoryCurrencySum {
  currency: string | null;
  category: string | null;
  amount: DecimalLike | null;
}

/** Invoice money summed for one currency. */
export interface InvoiceCurrencySum {
  currency: string | null;
  total: DecimalLike | null;
  amountPaid: DecimalLike | null;
}

/** How many invoices sit in one status. Counts, not money. */
export interface StatusCount {
  status: string | null;
  count: number;
}

/** Finished figures for a single currency. Every field is a fixed 2dp string. */
export interface CurrencyTotals {
  income: string;
  expenses: string;
  /** income minus expenses. */
  profit: string;
  invoiced: string;
  collected: string;
  /**
   * invoiced minus collected.
   *
   * Deliberately not clamped at zero. Per-invoice arithmetic clamps (see
   * `computePaymentSummary`) because one invoice cannot owe less than nothing,
   * but a company-wide total that has been over-collected is a real condition —
   * a duplicated payment, an overpayment — and hiding it behind a zero would
   * turn a figure worth investigating into one that looks settled.
   */
  outstanding: string;
}

/** One bar on the monthly chart. Numbers: this series is for display only. */
export interface MonthPoint {
  /** Sort and lookup key, 'YYYY-MM' in UTC. */
  monthKey: string;
  /** Axis label, e.g. 'Aug 26'. */
  month: string;
  income: number;
  expenses: number;
}

/** One slice of a pie chart. */
export interface CategorySlice {
  name: string;
  value: number;
}

export interface ReportsPayload {
  /** Currency codes present, sorted, so render order is stable. */
  currencies: string[];
  byCurrency: Record<string, CurrencyTotals>;
  /** Monthly income/expense series per currency, gap-free. */
  monthly: Record<string, MonthPoint[]>;
  /** Expense split by category per currency. */
  expenseCategories: Record<string, CategorySlice[]>;
  /** Invoice count per status. Counts are currency-independent. */
  invoiceStatusCounts: CategorySlice[];
  /**
   * Whether this company has ever recorded anything, ignoring status and date.
   *
   * Not derived from the totals: those are status-filtered, so a company whose
   * only income is still EXPECTED would otherwise be told it has not entered
   * anything yet. The route answers this with plain existence counts.
   */
  hasRecords: boolean;
}

export interface ReportsInput {
  /** RECEIVED income, summed per (currency, date). */
  income: DatedCurrencySum[];
  /** PAID expenses, summed per (currency, date). */
  expenses: DatedCurrencySum[];
  /** Expenses summed per (currency, category), for the pie. */
  expenseCategories: CategoryCurrencySum[];
  /** Invoice money summed per currency. */
  invoices: InvoiceCurrencySum[];
  /** Invoice counts per status. */
  invoiceStatuses: StatusCount[];
  hasRecords: boolean;
  /** Attributed to rows that carry no currency of their own. */
  defaultCurrency: string;
  /** Month window when the caller asked for an explicit date range. */
  window?: { startKey?: string; endKey?: string };
}

/**
 * Ceiling on the length of a monthly series.
 *
 * The chart draws the last twelve months. This is the payload guard against a
 * caller asking for a decade, not the display window — deliberately far above
 * what is drawn, so the series is never clipped to whatever the current UI
 * happens to want.
 */
export const MAX_MONTHS = 60;

/** Zeroed totals, so an absent currency reads as 0.00 rather than undefined. */
export function emptyTotals(): CurrencyTotals {
  return {
    income: '0.00',
    expenses: '0.00',
    profit: '0.00',
    invoiced: '0.00',
    collected: '0.00',
    outstanding: '0.00',
  };
}

/** Coerces anything Decimal-shaped to a Decimal, treating unusable input as 0. */
function dec(value: DecimalLike | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  try {
    const parsed = new Decimal(value.toString());
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The UTC month a record belongs to, as 'YYYY-MM'.
 *
 * UTC rather than local time, because these date columns are written as UTC
 * midnight (see the timezone note in calendar-range.ts). Bucketing with a
 * local-time formatter puts the first of a month into the previous one for any
 * viewer west of Greenwich — which is what the browser-side chart did.
 */
export function monthKeyOf(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Axis label for a month key: '2026-08' becomes 'Aug 26'. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const name = MONTH_NAMES[Number(month) - 1] ?? '???';
  return `${name} ${(year ?? '').slice(-2)}`;
}

/**
 * Every month from `startKey` to `endKey` inclusive, with none missing.
 *
 * A month in which nothing happened still gets a point, at zero. Omitting it
 * would let the chart draw January beside March as though they were adjacent,
 * so a quiet month would read as no month at all.
 *
 * Returns the most recent `max` months when the span is longer.
 */
export function monthSpine(startKey: string, endKey: string, max = MAX_MONTHS): string[] {
  if (!/^\d{4}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}$/.test(endKey)) return [];
  if (startKey > endKey) return [];

  const keys: string[] = [];
  let year = Number(startKey.slice(0, 4));
  let month = Number(startKey.slice(5, 7));
  if (month < 1 || month > 12) return [];

  let key = `${year}-${String(month).padStart(2, '0')}`;
  while (key <= endKey) {
    keys.push(key);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    key = `${year}-${String(month).padStart(2, '0')}`;
    // A malformed bound can never spin this loop indefinitely.
    if (keys.length >= 1200) break;
  }

  return keys.length > max ? keys.slice(-max) : keys;
}

/** Resolves a possibly-blank currency to the company default. */
function currencyOf(raw: string | null | undefined, fallback: string): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : fallback;
}

export function buildReport(input: ReportsInput): ReportsPayload {
  const fallback = input.defaultCurrency || 'USD';

  interface Running { income: Decimal; expenses: Decimal; invoiced: Decimal; collected: Decimal }
  const totals = new Map<string, Running>();
  const ensure = (currency: string): Running => {
    let running = totals.get(currency);
    if (!running) {
      running = {
        income: new Decimal(0),
        expenses: new Decimal(0),
        invoiced: new Decimal(0),
        collected: new Decimal(0),
      };
      totals.set(currency, running);
    }
    return running;
  };

  // Month buckets: currency -> monthKey -> running income/expenses.
  const months = new Map<string, Map<string, { income: Decimal; expenses: Decimal }>>();
  const bucket = (currency: string, key: string) => {
    let byMonth = months.get(currency);
    if (!byMonth) { byMonth = new Map(); months.set(currency, byMonth); }
    let point = byMonth.get(key);
    if (!point) { point = { income: new Decimal(0), expenses: new Decimal(0) }; byMonth.set(key, point); }
    return point;
  };

  for (const row of input.income) {
    const currency = currencyOf(row.currency, fallback);
    const amount = dec(row.amount);
    const running = ensure(currency);
    running.income = running.income.plus(amount);

    const key = monthKeyOf(row.date);
    if (key) {
      const point = bucket(currency, key);
      point.income = point.income.plus(amount);
    }
  }

  for (const row of input.expenses) {
    const currency = currencyOf(row.currency, fallback);
    const amount = dec(row.amount);
    const running = ensure(currency);
    running.expenses = running.expenses.plus(amount);

    const key = monthKeyOf(row.date);
    if (key) {
      const point = bucket(currency, key);
      point.expenses = point.expenses.plus(amount);
    }
  }

  for (const row of input.invoices) {
    const currency = currencyOf(row.currency, fallback);
    const running = ensure(currency);
    running.invoiced = running.invoiced.plus(dec(row.total));
    running.collected = running.collected.plus(dec(row.amountPaid));
  }

  // Expense categories, per currency so two currencies never share a slice.
  const categories = new Map<string, Map<string, Decimal>>();
  for (const row of input.expenseCategories) {
    const currency = currencyOf(row.currency, fallback);
    const name =
      typeof row.category === 'string' && row.category.trim() !== '' ? row.category : 'Other';

    let byName = categories.get(currency);
    if (!byName) { byName = new Map(); categories.set(currency, byName); }
    byName.set(name, (byName.get(name) ?? new Decimal(0)).plus(dec(row.amount)));

    // A currency appearing only here still needs a totals entry, or the page
    // would render a pie for a currency it has no cards for.
    ensure(currency);
  }

  // A company with nothing recorded still answers in its own currency, zeroed,
  // rather than with an empty object every caller has to special-case.
  if (totals.size === 0) ensure(fallback);

  const currencies = [...totals.keys()].sort((a, b) => a.localeCompare(b));

  const byCurrency: Record<string, CurrencyTotals> = {};
  const monthly: Record<string, MonthPoint[]> = {};
  const expenseCategories: Record<string, CategorySlice[]> = {};

  for (const currency of currencies) {
    const running = totals.get(currency)!;
    byCurrency[currency] = {
      income: running.income.toFixed(2),
      expenses: running.expenses.toFixed(2),
      profit: running.income.minus(running.expenses).toFixed(2),
      invoiced: running.invoiced.toFixed(2),
      collected: running.collected.toFixed(2),
      outstanding: running.invoiced.minus(running.collected).toFixed(2),
    };

    const byMonth = months.get(currency) ?? new Map<string, { income: Decimal; expenses: Decimal }>();
    const active = [...byMonth.keys()].sort();
    const startKey = input.window?.startKey ?? active[0];
    const endKey = input.window?.endKey ?? active[active.length - 1];

    monthly[currency] =
      startKey && endKey
        ? monthSpine(startKey, endKey).map((key) => {
            const point = byMonth.get(key);
            return {
              monthKey: key,
              month: monthLabel(key),
              income: point ? point.income.toNumber() : 0,
              expenses: point ? point.expenses.toNumber() : 0,
            };
          })
        : [];

    const slices = categories.get(currency);
    expenseCategories[currency] = slices
      ? [...slices.entries()]
          .map(([name, value]) => ({ name, value: value.toNumber() }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      : [];
  }

  // Merged by name rather than mapped one-to-one: the column defaults to
  // 'DRAFT', so a row that somehow carries no status belongs in the same slice
  // as the drafts rather than beside them as a second one with the same label.
  const statusCounts = new Map<string, number>();
  for (const row of input.invoiceStatuses) {
    const name = typeof row.status === 'string' && row.status.trim() !== '' ? row.status : 'DRAFT';
    const value = Number.isFinite(row.count) ? row.count : 0;
    statusCounts.set(name, (statusCounts.get(name) ?? 0) + value);
  }

  const invoiceStatusCounts = [...statusCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    currencies,
    byCurrency,
    monthly,
    expenseCategories,
    invoiceStatusCounts,
    hasRecords: input.hasRecords,
  };
}

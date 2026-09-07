import Decimal from 'decimal.js';
import type { DecimalLike } from '@/lib/payment-math';
import { safeTimeZone } from '@/lib/timezone';
import {
  isOpen,
  isChequeDirection,
  type ChequeDirection,
} from '@/lib/cheque-status';

/**
 * The three figures a cheque portfolio is judged by, per currency.
 *
 *   held      what is in the drawer — live instruments, not yet settled
 *   dueSoon   what falls due in the next 30 days, which is the cash-flow question
 *   bounced   what came back — the one that actually costs money
 *
 * Pure, no database, like `lib/reports-aggregate.ts` and `lib/statement-ledger.ts`,
 * so every boundary below can be tested without standing one up.
 *
 * ## Currency
 *
 * Grouped per currency and never summed across them, as everywhere else in this
 * codebase. A drawer holding a 10,000 TRY cheque and a 1,000 EUR cheque holds
 * two amounts, not one.
 *
 * ## Dates
 *
 * "Due in the next 30 days" is a question about the company's calendar, not the
 * server's. Vercel runs in UTC; a business in Europe/Istanbul is three hours
 * ahead, so a naive UTC window puts an instrument due on the 1st into last
 * month's bucket for the first three hours of every day. `lib/timezone.ts`
 * exists because that has already bitten twice, and this uses the same
 * approach: the window is built from wall-clock days in the company's zone and
 * then compared as instants.
 */

/** The subset of an instrument these totals need. */
export interface ChequeRow {
  direction: string | null;
  status: string | null;
  currency: string | null;
  amount: DecimalLike | null;
  dueDate: Date | string;
}

/** Finished figures for one currency. Fixed 2dp strings, converted once by the client. */
export interface ChequeCurrencyTotals {
  currency: string;
  /** Live instruments: not settled, not bounced, not cancelled. */
  held: string;
  /** Live instruments falling due inside the window. */
  dueSoon: string;
  /** Everything that came back, whenever it did. */
  bounced: string;
  /** How many live instruments make up `held`. */
  heldCount: number;
  /** How many live instruments fall due inside the window. */
  dueSoonCount: number;
  /** How many bounced. */
  bouncedCount: number;
}

export interface ChequeTotals {
  /** Currency codes present, sorted, so render order is stable. */
  currencies: string[];
  byCurrency: Record<string, ChequeCurrencyTotals>;
  /** Whether the company holds any instrument at all, whatever its state. */
  hasInstruments: boolean;
}

/** Days ahead the "due soon" window covers. */
export const DUE_SOON_DAYS = 30;

/** Zeroed figures, so an absent currency reads as 0.00 rather than undefined. */
export function emptyChequeTotals(currency: string): ChequeCurrencyTotals {
  return {
    currency,
    held: '0.00',
    dueSoon: '0.00',
    bounced: '0.00',
    heldCount: 0,
    dueSoonCount: 0,
    bouncedCount: 0,
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

function currencyOf(raw: string | null | undefined, fallback: string): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : fallback;
}

/** The wall-clock date parts in a zone, as `lib/timezone.ts` does it. */
function zonedParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const asUtc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asZoned = new Date(instant.toLocaleString('en-US', { timeZone }));
  return (asZoned.getTime() - asUtc.getTime()) / 60000;
}

/**
 * The instant at which a given wall-clock day begins in a zone.
 *
 * Built from `Date.UTC` and then corrected by the zone's offset, which is what
 * makes month and year boundaries come out right: 31 December plus one day is
 * 1 January of the next year, and `Date.UTC` already knows that, so no
 * arithmetic here has to.
 */
function startOfZonedDay(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offset = offsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

/**
 * The half-open window `[today, today + days)` in a company's own time zone.
 *
 * Half-open for the same reason `parseCalendarRange` is: adjacent windows must
 * neither overlap nor leave a gap. An instrument due today counts; one due
 * exactly `days` from now belongs to the next window.
 */
export function dueSoonWindow(
  timeZone?: string | null,
  now: Date = new Date(),
  days: number = DUE_SOON_DAYS
): { from: Date; to: Date } {
  const zone = safeTimeZone(timeZone);
  const { year, month, day } = zonedParts(now, zone);
  const from = startOfZonedDay(year, month, day, zone);
  // Adding to the day number rather than to the millisecond count: Date.UTC
  // normalises 31 + 30 into the following month, and 31 December into January,
  // so month and year boundaries need no special case. Doing it in
  // milliseconds would also silently drift by an hour across a DST change.
  const to = startOfZonedDay(year, month, day + days, zone);
  return { from, to };
}

/** Parses a stored due date to an instant, or null when unusable. */
function dueInstant(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface ChequeTotalsInput {
  rows: ChequeRow[];
  /** Attributed to rows carrying no currency of their own. */
  defaultCurrency: string;
  /** Restrict to one side of the book. Both when omitted. */
  direction?: ChequeDirection | null;
  /** The company's IANA zone, for the due-soon window. */
  timeZone?: string | null;
  now?: Date;
  days?: number;
}

/**
 * Folds instruments into per-currency figures.
 *
 * Nothing here is "collected" money. `held` is the face value of promises still
 * outstanding — it must never be added to a revenue figure, and no caller does.
 */
export function buildChequeTotals(input: ChequeTotalsInput): ChequeTotals {
  const fallback = input.defaultCurrency || 'USD';
  const { from, to } = dueSoonWindow(input.timeZone, input.now, input.days);

  const buckets = new Map<string, ChequeCurrencyTotals>();
  const ensure = (currency: string): ChequeCurrencyTotals => {
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = emptyChequeTotals(currency);
      buckets.set(currency, bucket);
    }
    return bucket;
  };

  const held = new Map<string, Decimal>();
  const dueSoon = new Map<string, Decimal>();
  const bounced = new Map<string, Decimal>();
  const add = (map: Map<string, Decimal>, currency: string, amount: Decimal) =>
    map.set(currency, (map.get(currency) ?? new Decimal(0)).plus(amount));

  let counted = 0;

  for (const row of input.rows ?? []) {
    if (input.direction && row.direction !== input.direction) continue;
    // A row whose direction is not one of the two is data this module cannot
    // reason about; counting it would put an unexplained amount in a total.
    if (!isChequeDirection(row.direction)) continue;

    counted += 1;
    const currency = currencyOf(row.currency, fallback);
    const amount = dec(row.amount);
    const bucket = ensure(currency);

    if (row.status === 'BOUNCED') {
      add(bounced, currency, amount);
      bucket.bouncedCount += 1;
      continue;
    }

    if (!isOpen(row.status)) continue; // CLEARED, PAID, CANCELLED: settled, not held.

    add(held, currency, amount);
    bucket.heldCount += 1;

    const due = dueInstant(row.dueDate);
    if (due && due.getTime() >= from.getTime() && due.getTime() < to.getTime()) {
      add(dueSoon, currency, amount);
      bucket.dueSoonCount += 1;
    }
  }

  for (const [currency, bucket] of buckets.entries()) {
    bucket.held = (held.get(currency) ?? new Decimal(0)).toFixed(2);
    bucket.dueSoon = (dueSoon.get(currency) ?? new Decimal(0)).toFixed(2);
    bucket.bounced = (bounced.get(currency) ?? new Decimal(0)).toFixed(2);
  }

  const currencies = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  const byCurrency: Record<string, ChequeCurrencyTotals> = {};
  for (const currency of currencies) byCurrency[currency] = buckets.get(currency)!;

  return { currencies, byCurrency, hasInstruments: counted > 0 };
}

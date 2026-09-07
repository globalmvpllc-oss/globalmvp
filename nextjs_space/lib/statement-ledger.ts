import Decimal from 'decimal.js';
import { parseCalendarDate } from '@/lib/calendar-date';
import type { DecimalLike } from '@/lib/payment-math';

/**
 * Running account ledgers — "cari hesap ekstresi" — for a customer or a vendor.
 *
 * Pure shaping, no database access, like reports-aggregate.ts and
 * payment-math.ts. The routes read rows and hand them here; every decision
 * about ordering, opening balances and what counts as a movement lives in this
 * file so it can be tested without a live Postgres.
 *
 * ## What a statement is
 *
 * Three numbers — invoiced, paid, outstanding — say where an account stands but
 * not how it got there. A statement answers the question a business actually
 * asks on the phone: what happened on this account, in order, and what is the
 * balance after each step.
 *
 *     1 Mar   Invoice INV-0042      +5,000      balance 5,000
 *     15 Mar  Payment received      -2,000      balance 3,000
 *     22 Mar  Invoice INV-0051      +1,200      balance 4,200
 *
 * ## Sign convention
 *
 * One convention, two readings. A debit always increases the balance and a
 * credit always reduces it; what the balance *means* depends on the side:
 *
 *   customer  the balance is what they owe you. Invoices debit, payments
 *             received credit.
 *   vendor    the balance is what you owe them. Expenses debit, payments made
 *             credit.
 *
 * A negative balance is never clamped. On a customer account it means they have
 * paid more than they were invoiced — an advance, or an overpayment worth
 * chasing. Clamping at zero would report a settled account while money is
 * actually sitting on it. (`computePaymentSummary` clamps deliberately, because
 * one invoice cannot owe less than nothing; an account can.)
 *
 * ## Currency
 *
 * Money is grouped per currency and never summed across currencies, matching
 * the dashboard, the reports endpoint and the existing customer totals. A
 * customer invoiced in EUR and USD has two balances, not one, and nothing here
 * converts between them.
 *
 * A payment carries its own `currency` column, so a EUR payment against a USD
 * invoice lands in the EUR ledger and does not clear the USD debit. That is the
 * honest reading of "never convert": they are different money. It surfaces as a
 * reconciliation difference rather than being quietly netted off.
 *
 * ## Precision
 *
 * Balances are running sums of Decimal columns, added with decimal.js and never
 * with floating point — a hundred rows of 0.10 must not drift. Every figure
 * leaves as a fixed 2-decimal string and the client converts once at the
 * display boundary with `toAmount`, exactly as /api/reports does.
 */

/**
 * Ceiling on how many rows of one kind a statement will load.
 *
 * The running balance has to be computed over the complete set of movements
 * for an account, so these queries are deliberately not paginated by the
 * caller. This is the guard against an unbounded read, set far above what one
 * customer of a small business accumulates in a lifetime. When it is reached
 * the route says so rather than quietly returning a balance built from part of
 * the account — the same principle as `listResponse`.
 */
export const STATEMENT_MAX_ROWS = 2000;

/** What kind of document produced a movement. */
export type MovementKind = 'invoice' | 'expense' | 'income' | 'payment' | 'settlement';

/**
 * Order of same-day movements.
 *
 * Two entries on the same date must produce the same ledger every time, and the
 * order has to be the one a reader expects: the debit that creates the balance
 * before the credit that clears it. An invoice raised and paid on 1 March reads
 * +5,000 then -5,000, not -5,000 first with a negative balance in between.
 * Ties inside a rank fall back to the row id, which is stable across requests
 * where a database's natural order is not.
 */
const KIND_RANK: Record<MovementKind, number> = {
  invoice: 0,
  expense: 0,
  income: 1,
  payment: 2,
  settlement: 3,
};

/** A movement offered to the ledger. Amounts may be Decimal, number or string. */
export interface StatementMovement {
  id: string;
  kind: MovementKind;
  date: Date | string;
  currency: string | null;
  /** Human reference: invoice number, payment method, description. */
  reference: string;
  description?: string | null;
  status?: string | null;
  /** Increases the balance. */
  debit?: DecimalLike | null;
  /** Reduces the balance. */
  credit?: DecimalLike | null;
  /** Where the row links to in the UI, when the document has a page of its own. */
  href?: string | null;
}

/** A movement as rendered: dated, formatted, with the balance after it. */
export interface StatementRow {
  id: string;
  kind: MovementKind;
  /** 'YYYY-MM-DD', UTC-pinned like every other calendar date in this codebase. */
  date: string;
  reference: string;
  description: string;
  status: string | null;
  debit: string;
  credit: string;
  /** Running balance after this row. */
  balance: string;
  href: string | null;
}

export interface CurrencyStatement {
  currency: string;
  /**
   * Balance carried into the window.
   *
   * When a date range is given the rows before it must not simply vanish: the
   * balance would restart from zero and every figure after it would be wrong.
   * This is the balance as it stood the instant before the window opened.
   */
  opening: string;
  /** Movements inside the window, in ledger order. */
  rows: StatementRow[];
  /** Debits inside the window. */
  debitTotal: string;
  /** Credits inside the window. */
  creditTotal: string;
  /** Balance at the end of the window — opening plus the rows above. */
  closing: string;
  /** Balance after every movement on the account, ignoring the window. */
  accountBalance: string;
  /** Movements on the account in this currency, ignoring the window. */
  movementCount: number;
}

export interface StatementPayload {
  /** Currency codes present, sorted, so render order is stable. */
  currencies: string[];
  byCurrency: Record<string, CurrencyStatement>;
  /**
   * Whether the account has any movement at all, ignoring the window.
   *
   * Not derived from the rows: a window with nothing in it is a different state
   * from an account that has never moved, and the two deserve different empty
   * states.
   */
  hasMovements: boolean;
}

/** Half-open window, `gte` inclusive and `lt` exclusive — as parseCalendarRange gives it. */
export interface StatementWindow {
  gte?: Date | null;
  lt?: Date | null;
}

export interface StatementInput {
  movements: StatementMovement[];
  /** Attributed to movements that carry no currency of their own. */
  defaultCurrency: string;
  window?: StatementWindow | null;
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

/** Resolves a possibly-blank currency to the fallback. */
function currencyOf(raw: string | null | undefined, fallback: string): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : fallback;
}

/**
 * The UTC day a movement belongs to.
 *
 * Pinned through `parseCalendarDate` because these columns hold UTC midnight;
 * comparing them in local time is what put invoice due dates on the wrong day
 * for every user west of Greenwich. An unparseable date sorts to the epoch
 * rather than being dropped — a movement quietly removed would take its amount
 * out of the balance with nothing on screen to say so.
 */
function dayOf(value: Date | string): Date {
  return parseCalendarDate(value) ?? new Date(0);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildStatement(input: StatementInput): StatementPayload {
  const fallback = input.defaultCurrency || 'USD';
  const from = input.window?.gte ?? null;
  const to = input.window?.lt ?? null;

  interface Prepared extends StatementMovement {
    day: Date;
    debitDec: Decimal;
    creditDec: Decimal;
  }

  const buckets = new Map<string, Prepared[]>();
  for (const movement of input.movements ?? []) {
    const currency = currencyOf(movement.currency, fallback);
    const list = buckets.get(currency) ?? [];
    list.push({
      ...movement,
      day: dayOf(movement.date),
      debitDec: dec(movement.debit),
      creditDec: dec(movement.credit),
    });
    buckets.set(currency, list);
  }

  // An account with nothing on it still answers in one currency, zeroed, rather
  // than with an empty object every caller has to special-case.
  const hasMovements = buckets.size > 0;
  if (!hasMovements) buckets.set(fallback, []);

  const currencies = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  const byCurrency: Record<string, CurrencyStatement> = {};

  for (const currency of currencies) {
    const prepared = buckets.get(currency)!;

    prepared.sort((a, b) => {
      const byDate = a.day.getTime() - b.day.getTime();
      if (byDate !== 0) return byDate;
      const byKind = (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99);
      if (byKind !== 0) return byKind;
      return a.id.localeCompare(b.id);
    });

    let balance = new Decimal(0);
    let opening = new Decimal(0);
    let debitTotal = new Decimal(0);
    let creditTotal = new Decimal(0);
    let closing = new Decimal(0);
    const rows: StatementRow[] = [];

    for (const movement of prepared) {
      // The running balance is accumulated over every movement on the account,
      // in order, and only then filtered for display. Computing it from the
      // window alone would restart it at zero; computing it from a page of rows
      // would make the balance depend on the page size.
      balance = balance.plus(movement.debitDec).minus(movement.creditDec);

      if (from !== null && movement.day.getTime() < from.getTime()) {
        opening = balance;
        closing = balance;
        continue;
      }

      // At or past the exclusive upper bound: still counted into the account
      // balance, never drawn inside this window.
      if (to !== null && movement.day.getTime() >= to.getTime()) continue;

      debitTotal = debitTotal.plus(movement.debitDec);
      creditTotal = creditTotal.plus(movement.creditDec);
      closing = balance;

      rows.push({
        id: movement.id,
        kind: movement.kind,
        date: isoDay(movement.day),
        reference: movement.reference ?? '',
        description: movement.description ?? '',
        status: movement.status ?? null,
        debit: movement.debitDec.toFixed(2),
        credit: movement.creditDec.toFixed(2),
        balance: balance.toFixed(2),
        href: movement.href ?? null,
      });
    }

    // Nothing fell inside the window: the balance at the end of it is the one
    // carried in, not zero.
    if (rows.length === 0) closing = opening;

    byCurrency[currency] = {
      currency,
      opening: opening.toFixed(2),
      rows,
      debitTotal: debitTotal.toFixed(2),
      creditTotal: creditTotal.toFixed(2),
      closing: closing.toFixed(2),
      accountBalance: balance.toFixed(2),
      movementCount: prepared.length,
    };
  }

  return { currencies, byCurrency, hasMovements };
}

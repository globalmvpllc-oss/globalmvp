import Decimal from 'decimal.js';
import type { BankDirection, BankTransactionStatus, MatchTargetType } from './types';

/**
 * Reading reconciliation state, and adding money up correctly.
 *
 * Pure. No Prisma types are imported — the shapes below are structural, so a
 * database row, an API response and a test fixture all satisfy them.
 */

/** The four nullable links a stored bank line carries. */
export interface MatchLinks {
  matchedInvoiceId?: string | null;
  matchedPaymentId?: string | null;
  matchedIncomeId?: string | null;
  matchedExpenseId?: string | null;
}

/** Ordered so `resolveMatchTarget` returns a deterministic winner if a row ever
 *  ends up with two links — which the API prevents, but the type cannot. */
const LINK_FIELDS: Array<{ type: MatchTargetType; field: keyof MatchLinks }> = [
  { type: 'INVOICE', field: 'matchedInvoiceId' },
  { type: 'PAYMENT', field: 'matchedPaymentId' },
  { type: 'INCOME', field: 'matchedIncomeId' },
  { type: 'EXPENSE', field: 'matchedExpenseId' },
];

/** Which record a bank line is linked to, or null when it is linked to none. */
export function resolveMatchTarget(
  links: MatchLinks
): { type: MatchTargetType; id: string } | null {
  for (const { type, field } of LINK_FIELDS) {
    const id = links[field];
    if (typeof id === 'string' && id !== '') return { type, id };
  }
  return null;
}

/** The Prisma `data` object that sets exactly one link and clears the other three. */
export function matchLinkData(target: { type: MatchTargetType; id: string } | null): Required<MatchLinks> {
  return {
    matchedInvoiceId: target?.type === 'INVOICE' ? target.id : null,
    matchedPaymentId: target?.type === 'PAYMENT' ? target.id : null,
    matchedIncomeId: target?.type === 'INCOME' ? target.id : null,
    matchedExpenseId: target?.type === 'EXPENSE' ? target.id : null,
  };
}

/**
 * What a bank line's state actually is, as opposed to what its status column says.
 *
 * The two can disagree, by design. Deleting an invoice sets
 * `matchedInvoiceId` to NULL (`ON DELETE SET NULL`) but cannot rewrite the
 * status column, so a row would otherwise claim MATCHED while pointing at
 * nothing — the reconciliation screen would show a match the user cannot open,
 * and the unreconciled count would under-report.
 *
 * Reading the state through here makes that case degrade to what it really is:
 * an unreconciled bank line, back in the queue.
 *
 * IGNORED wins over everything: it is an explicit decision by a person that this
 * line needs no counterpart (a bank fee, an internal transfer), and it must not
 * be undone by the record it happened to be linked to disappearing.
 */
export function effectiveStatus(
  row: MatchLinks & { status?: string | null }
): BankTransactionStatus {
  if (row.status === 'IGNORED') return 'IGNORED';
  return resolveMatchTarget(row) ? 'MATCHED' : 'UNMATCHED';
}

/** True when the line still needs someone's attention. */
export function isUnreconciled(row: MatchLinks & { status?: string | null }): boolean {
  return effectiveStatus(row) === 'UNMATCHED';
}

/**
 * The Prisma `where` fragment that selects unreconciled lines.
 *
 * Written as data rather than derived from `effectiveStatus`, because it has to
 * run in the database. The two must agree, which is what the unit tests pin:
 * every row this fragment selects is one `effectiveStatus` calls UNMATCHED.
 */
export const UNRECONCILED_WHERE = {
  status: { not: 'IGNORED' },
  matchedInvoiceId: null,
  matchedPaymentId: null,
  matchedIncomeId: null,
  matchedExpenseId: null,
} as const;

// --- Money -------------------------------------------------------------------

/** The signed effect a line has on an account balance. */
export function signedAmount(row: { amount: Decimal.Value; direction: BankDirection }): Decimal {
  const value = new Decimal(String(row.amount));
  return row.direction === 'DEBIT' ? value.negated() : value;
}

/** Net movement across a set of lines, in one currency. Callers must not mix. */
export function netMovement(
  rows: Array<{ amount: Decimal.Value; direction: BankDirection }>
): Decimal {
  return rows.reduce<Decimal>((total, row) => total.plus(signedAmount(row)), new Decimal(0));
}

export interface AccountBalanceInput {
  currency: string;
  /** What the bank last reported. Null when the account has never been reconciled
   *  against a statement balance. */
  lastBalance?: Decimal.Value | null;
}

export interface CurrencyPosition {
  currency: string;
  /** Sum of the reported balances of accounts in this currency. */
  total: string;
  /** How many accounts contributed. */
  accounts: number;
  /** How many of those have never reported a balance — so the total understates
   *  the real position and the UI can say so. */
  accountsWithoutBalance: number;
}

/**
 * Cash position, grouped by currency.
 *
 * Grouped rather than converted, exactly as the dashboard and reports already
 * present multi-currency figures: there is no exchange-rate source in this
 * application, and inventing one to show a single number would be making up
 * financial data.
 *
 * Accounts with no reported balance are counted separately instead of being
 * treated as zero, because "we do not know" and "it is empty" are different
 * answers and only one of them is safe to show as a cash position.
 */
export function cashPositionByCurrency(accounts: AccountBalanceInput[]): CurrencyPosition[] {
  const byCurrency = new Map<string, CurrencyPosition & { sum: Decimal }>();

  for (const account of accounts) {
    const currency = account.currency || 'USD';
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = {
        currency,
        total: '0.00',
        accounts: 0,
        accountsWithoutBalance: 0,
        sum: new Decimal(0),
      };
      byCurrency.set(currency, entry);
    }

    entry.accounts += 1;
    if (account.lastBalance === null || account.lastBalance === undefined) {
      entry.accountsWithoutBalance += 1;
    } else {
      entry.sum = entry.sum.plus(new Decimal(String(account.lastBalance)));
    }
  }

  return [...byCurrency.values()]
    .map(({ sum, ...rest }) => ({ ...rest, total: sum.toFixed(2) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The share of lines that have been dealt with, as a whole percentage.
 *
 * Ignored lines count as dealt with: someone looked at them and decided they
 * need no counterpart, which is a completed reconciliation decision. Returns
 * 100 for an account with nothing in it — there is nothing outstanding.
 */
export function reconciliationRate(counts: {
  matched: number;
  ignored: number;
  unmatched: number;
}): number {
  const total = counts.matched + counts.ignored + counts.unmatched;
  if (total <= 0) return 100;
  return Math.round(((counts.matched + counts.ignored) / total) * 100);
}

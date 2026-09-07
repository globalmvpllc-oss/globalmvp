/**
 * The vocabulary of the banking module.
 *
 * Kept free of Prisma and of `next/server` so every consumer — API routes,
 * client pages and the unit tests — agrees on one set of literals. Strings
 * rather than Prisma enums, matching how invoice and transaction statuses are
 * already modelled in this schema.
 */

/** Which way the money moved, from the account's point of view. */
export const BANK_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
export type BankDirection = (typeof BANK_DIRECTIONS)[number];

/** Stored reconciliation intent. The *effective* state also depends on whether
 *  the linked record still exists — see reconciliation.ts. */
export const BANK_TRANSACTION_STATUSES = ['UNMATCHED', 'MATCHED', 'IGNORED'] as const;
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number];

/** The record kinds a bank line can be reconciled against. */
export const MATCH_TARGET_TYPES = ['INVOICE', 'PAYMENT', 'INCOME', 'EXPENSE'] as const;
export type MatchTargetType = (typeof MATCH_TARGET_TYPES)[number];

/**
 * The direction each target kind can settle.
 *
 * An invoice is money owed *to* this business, so only a credit can reconcile
 * it; an expense is money owed *by* it. A payment follows whatever it is linked
 * to, which is why PAYMENT accepts both and the candidate loader decides per
 * row rather than per kind.
 */
export const TARGET_DIRECTIONS: Record<MatchTargetType, readonly BankDirection[]> = {
  INVOICE: ['CREDIT'],
  INCOME: ['CREDIT'],
  EXPENSE: ['DEBIT'],
  PAYMENT: ['CREDIT', 'DEBIT'],
};

/** Where a bank line's data comes from, before it is stored. */
export interface NormalizedBankTransaction {
  /** Stable provider- or file-side id, when there is one. Makes import idempotent. */
  externalId?: string;
  /** 'YYYY-MM-DD'. Parsed with lib/calendar-date.ts on the way into the database. */
  date: string;
  description: string;
  /** Always positive. `direction` carries the sign. */
  amount: number;
  currency: string;
  direction: BankDirection;
  /** Running balance after the line, when the statement supplies one. */
  balance?: number;
  reference?: string;
}

/** A financial record a bank line could be reconciled against. */
export interface MatchCandidate {
  type: MatchTargetType;
  id: string;
  /** What the user sees in the suggestion list. */
  label: string;
  /**
   * Translation key for that label, and the values it interpolates.
   *
   * Null when the label is text the user typed themselves — an income or
   * expense description — which is shown as it is and never translated.
   */
  labelKey?: string | null;
  labelValues?: Record<string, string>;
  /** Secondary line: customer, vendor, category. */
  sublabel?: string;
  /** The amount that would settle this record — for an invoice, what is still
   *  outstanding rather than the full total. Always positive. */
  amount: number;
  currency: string;
  /** ISO date or 'YYYY-MM-DD'. */
  date: string;
  /** Which direction of bank line can settle it. */
  direction: BankDirection;
  /** Invoice number, payment reference — anything that might appear verbatim in
   *  a bank description. */
  reference?: string;
}

/** A candidate with its score and the reasons behind it. */
export interface ScoredCandidate extends MatchCandidate {
  /** 0-100. */
  score: number;
  /** Human-readable reasons, shown next to the suggestion. */
  reasons: string[];
  /**
   * The same reasons as translation keys with their values.
   *
   * Parallel to `reasons` rather than replacing it: the English array is part
   * of this module's existing contract, and the screen prefers these so a
   * Turkish reader is not handed "Exact amount".
   */
  reasonCodes: Array<{ key: string; values?: Record<string, string> }>;
}

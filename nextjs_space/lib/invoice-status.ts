/**
 * Invoice status state machine.
 * Only allowed transitions are permitted.
 */

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
  VIEWED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID', 'CANCELLED'],
  PAID: [],       // Terminal state
  CANCELLED: [],  // Terminal state
};

/**
 * Invoices that represent money a customer actually owes, or has paid.
 *
 * The one definition of "this document is real". A DRAFT has never been issued
 * to anybody — it is a document being written — and a CANCELLED one has been
 * withdrawn. Neither is a claim on a customer, so neither may appear in any
 * figure that answers "what were they billed" or "what do they owe".
 *
 * This existed in three places and disagreed in one of them. The customer
 * detail cards and the reports totals summed every status, so a business with
 * four unissued drafts was told a customer owed it tens of thousands. That is
 * not a rounding difference; it is a number that is simply untrue, and it sat
 * directly above a statement that (correctly) excluded the same drafts.
 *
 * Everything that sums invoice money now reads this, so the surfaces cannot
 * drift apart again.
 */
export const ISSUED_INVOICE_STATUSES = [
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
] as const satisfies readonly InvoiceStatus[];

/** The complement: documents that are not a claim on anybody. */
export const UNISSUED_INVOICE_STATUSES = ['DRAFT', 'CANCELLED'] as const satisfies readonly InvoiceStatus[];

/**
 * Issued invoices that can still receive money.
 *
 * A narrower question than `ISSUED_INVOICE_STATUSES`, and a different one: this
 * is "what is still open", which is what the dashboard's receivables and the
 * bank reconciliation's candidate pool both want. PAID is deliberately absent —
 * a settled invoice contributes nothing to a receivable and must not be offered
 * as somewhere to put another payment.
 *
 * Kept beside the set above so the relationship between the two is visible:
 * every open status is an issued status.
 */
export const OPEN_INVOICE_STATUSES = [
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'OVERDUE',
] as const satisfies readonly InvoiceStatus[];

/**
 * Statuses that describe money, not intent — and so are never asserted by hand.
 *
 * `ALLOWED_TRANSITIONS` above says SENT -> PAID is reachable, and it is. What it
 * cannot say is *how*: an invoice arrives at PAID because payments cover its
 * total, never because somebody set a field. The route that used to grant the
 * request wrote `{ status: 'PAID' }` and nothing else, leaving `amountPaid` at
 * zero — so an invoice read as settled on its own page while the statement and
 * the reports went on counting the full amount as owed. Two screens telling the
 * user opposite things about the same document.
 *
 * The rule the code now keeps, everywhere:
 *
 *     an invoice is PAID only when amountPaid >= total
 *
 * Marking one paid is still a single click; it now records the payment that
 * makes the claim true, in the same transaction that moves the status, and the
 * status is derived from the money afterwards rather than written directly.
 * PARTIALLY_PAID is refused outright — "partly paid" without saying how much is
 * not a fact anybody can act on.
 *
 * Note the invariant is about the amount, not about a Payment row existing: an
 * invoice with a zero total is vacuously covered and may close with no payment.
 */
export const MONEY_DERIVED_STATUSES = ['PARTIALLY_PAID', 'PAID'] as const;

/** True when a status must follow from payments rather than from a request. */
export function isMoneyDerivedStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    (MONEY_DERIVED_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * A Decimal column, a number or a numeric string as a number — or null.
 *
 * Null for anything missing or unreadable, deliberately: absent is not zero
 * here. Coalescing a missing total to 0 would make it look covered by a
 * payment of nothing, which is the exact claim this module exists to refuse.
 */
function amountOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * True when the amount collected covers the invoice, so PAID is honest.
 *
 * This is the PAID half of the invariant and nothing more. It says nothing
 * useful about PARTIALLY_PAID, where `amountPaid < total` is the whole point —
 * asking it about one will call a perfectly correct invoice a violation.
 *
 * The complete question, for any status, is whether
 * `deriveStatusFromPayments` agrees with what is stored; that is the single
 * expression of the rule and what `scripts/repair-invoice-status.ts` uses. This
 * exists for the one place that only ever asks about PAID.
 */
export function coversTotal(total: unknown, amountPaid: unknown): boolean {
  const totalNumber = amountOrNull(total);
  const paidNumber = amountOrNull(amountPaid);
  if (totalNumber === null || paidNumber === null) return false;
  return paidNumber >= totalNumber;
}

/** True when an invoice has been issued and not cancelled. */
export function isIssuedInvoice(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    (ISSUED_INVOICE_STATUSES as readonly string[]).includes(status)
  );
}

export function isValidStatus(status: string): status is InvoiceStatus {
  return INVOICE_STATUSES.includes(status as InvoiceStatus);
}

export function canTransition(from: string, to: string): boolean {
  if (!isValidStatus(from) || !isValidStatus(to)) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Derive invoice status from payment state.
 * Called after payment changes.
 */
export function deriveStatusFromPayments(currentStatus: string, amountPaid: number, total: number): InvoiceStatus {
  // Don't change DRAFT or CANCELLED
  if (currentStatus === 'DRAFT' || currentStatus === 'CANCELLED') return currentStatus as InvoiceStatus;

  if (amountPaid >= total && total > 0) return 'PAID';
  if (amountPaid > 0) return 'PARTIALLY_PAID';

  // If no payments, keep the current active status
  if (['SENT', 'VIEWED', 'OVERDUE'].includes(currentStatus)) return currentStatus as InvoiceStatus;
  return 'SENT';
}

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

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

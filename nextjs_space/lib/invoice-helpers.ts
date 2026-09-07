import type { TranslationKey } from '@/lib/i18n';

/**
 * Invoice status presentation.
 *
 * `value` is the string stored in the database and is never translated: every
 * query, filter and state transition compares it, so changing it would break
 * them. `labelKey` is what the reader sees, resolved through `t()` at render
 * time; `label` is the English text kept for callers with no translator to
 * hand.
 */
export const INVOICE_STATUSES = [
  { value: 'DRAFT', label: 'Draft', labelKey: 'status.draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'SENT', label: 'Sent', labelKey: 'status.sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'VIEWED', label: 'Viewed', labelKey: 'status.viewed', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid', labelKey: 'status.partiallyPaid', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'PAID', label: 'Paid', labelKey: 'status.paid', color: 'bg-green-100 text-green-700' },
  { value: 'OVERDUE', label: 'Overdue', labelKey: 'status.overdue', color: 'bg-red-100 text-red-700' },
  { value: 'CANCELLED', label: 'Cancelled', labelKey: 'status.cancelled', color: 'bg-gray-100 text-gray-500' },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  labelKey: TranslationKey;
  color: string;
}>;

/** Presentation for a stored status value. Matches on `value`, never on a label. */
export function getStatusBadge(status: string) {
  return INVOICE_STATUSES.find((s) => s.value === status) ?? INVOICE_STATUSES[0];
}

export function generateInvoiceNumber(count: number): string {
  const num = (count + 1).toString().padStart(4, '0');
  return `INV-${num}`;
}

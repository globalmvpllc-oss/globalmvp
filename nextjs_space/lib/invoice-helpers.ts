export const INVOICE_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'SENT', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'VIEWED', label: 'Viewed', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'PAID', label: 'Paid', color: 'bg-green-100 text-green-700' },
  { value: 'OVERDUE', label: 'Overdue', color: 'bg-red-100 text-red-700' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
] as const;

export function getStatusBadge(status: string) {
  return INVOICE_STATUSES.find((s: any) => s.value === status) ?? INVOICE_STATUSES[0];
}

export function generateInvoiceNumber(count: number): string {
  const num = (count + 1).toString().padStart(4, '0');
  return `INV-${num}`;
}

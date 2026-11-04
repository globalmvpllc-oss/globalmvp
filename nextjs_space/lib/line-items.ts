import { calculateInvoice, d2n, type InvoiceItemInput } from '@/lib/invoice-calc';

/**
 * Line items + totals for any document that has them (invoice, quote,
 * recurring template), computed with the same Decimal engine as invoices so
 * a quote converted to an invoice keeps exactly the same figures.
 */
export function computeLineItems(items: InvoiceItemInput[]) {
  const { totals, errors } = calculateInvoice(items);
  return {
    errors,
    totals: {
      subtotal: d2n(totals.subtotal),
      taxTotal: d2n(totals.taxTotal),
      discountTotal: d2n(totals.discountTotal),
      total: d2n(totals.total),
    },
    rows: totals.items.map((item) => ({
      description: item.description,
      quantity: d2n(item.quantity),
      unitPrice: d2n(item.unitPrice),
      discount: d2n(item.discount),
      taxRate: d2n(item.taxRate),
      taxLabel: item.taxLabel,
      amount: d2n(item.amount),
    })),
  };
}

/** Stored item rows back to calculator input (Decimal columns → numbers). */
export function itemsFromRows(rows: any[]): InvoiceItemInput[] {
  return (rows ?? []).map((row) => ({
    description: String(row.description ?? ''),
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unitPrice ?? 0),
    discount: Number(row.discount ?? 0),
    taxRate: Number(row.taxRate ?? 0),
    taxLabel: String(row.taxLabel ?? 'VAT'),
  }));
}

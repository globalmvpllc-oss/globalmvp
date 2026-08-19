import Decimal from 'decimal.js';

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface InvoiceItemInput {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  discount?: number | string;
  taxRate?: number | string;
  taxLabel?: string;
}

export interface CalculatedItem {
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discount: Decimal;
  taxRate: Decimal;
  taxLabel: string;
  lineSubtotal: Decimal;  // qty * unitPrice
  taxableAmount: Decimal; // lineSubtotal - discount
  taxAmount: Decimal;     // taxableAmount * taxRate / 100
  amount: Decimal;        // taxableAmount + taxAmount
}

export interface InvoiceTotals {
  subtotal: Decimal;      // sum of lineSubtotals
  discountTotal: Decimal; // sum of discounts
  taxTotal: Decimal;      // sum of taxAmounts
  total: Decimal;         // subtotal - discountTotal + taxTotal
  items: CalculatedItem[];
}

/**
 * Validates a single invoice item input and returns errors.
 */
function validateItem(item: InvoiceItemInput, index: number): string[] {
  const errors: string[] = [];
  const qty = new Decimal(item.quantity || 0);
  const price = new Decimal(item.unitPrice || 0);
  const disc = new Decimal(item.discount || 0);
  const tax = new Decimal(item.taxRate || 0);

  if (qty.lte(0)) errors.push(`Item ${index + 1}: quantity must be > 0`);
  if (price.lt(0)) errors.push(`Item ${index + 1}: unit price must be >= 0`);
  if (disc.lt(0)) errors.push(`Item ${index + 1}: discount must be >= 0`);
  if (tax.lt(0)) errors.push(`Item ${index + 1}: tax rate must be >= 0`);
  if (tax.gt(100)) errors.push(`Item ${index + 1}: tax rate must be <= 100`);

  return errors;
}

/**
 * Centralized invoice calculation engine.
 * All arithmetic uses Decimal.js — no floating-point.
 * Returns validated, computed line items and invoice totals.
 */
export function calculateInvoice(items: InvoiceItemInput[]): { totals: InvoiceTotals; errors: string[] } {
  const allErrors: string[] = [];
  if (!items || items.length === 0) {
    allErrors.push('At least one item is required');
    return {
      totals: {
        subtotal: new Decimal(0),
        discountTotal: new Decimal(0),
        taxTotal: new Decimal(0),
        total: new Decimal(0),
        items: [],
      },
      errors: allErrors,
    };
  }

  const calculatedItems: CalculatedItem[] = [];
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let taxTotal = new Decimal(0);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemErrors = validateItem(item, i);
    allErrors.push(...itemErrors);

    const qty = new Decimal(item.quantity || 0);
    const price = new Decimal(item.unitPrice || 0);
    const disc = new Decimal(item.discount || 0);
    const taxRate = new Decimal(item.taxRate || 0);

    const lineSubtotal = qty.mul(price);
    const taxableAmount = Decimal.max(lineSubtotal.minus(disc), new Decimal(0));
    const taxAmount = taxableAmount.mul(taxRate).div(100);
    const amount = taxableAmount.plus(taxAmount);

    subtotal = subtotal.plus(lineSubtotal);
    discountTotal = discountTotal.plus(disc);
    taxTotal = taxTotal.plus(taxAmount);

    calculatedItems.push({
      description: item.description ?? '',
      quantity: qty,
      unitPrice: price,
      discount: disc,
      taxRate,
      taxLabel: item.taxLabel ?? 'VAT',
      lineSubtotal,
      taxableAmount,
      taxAmount,
      amount,
    });
  }

  const total = subtotal.minus(discountTotal).plus(taxTotal);

  // Guard against NaN/Infinity
  if (!total.isFinite()) {
    allErrors.push('Calculation resulted in invalid value');
  }

  return {
    totals: { subtotal, discountTotal, taxTotal, total, items: calculatedItems },
    errors: allErrors,
  };
}

/**
 * Convert Decimal to number for Prisma Decimal fields.
 * Prisma Decimal accepts string or number — we use toNumber() for Decimal fields.
 */
export function d2n(d: Decimal): number {
  return d.toNumber();
}

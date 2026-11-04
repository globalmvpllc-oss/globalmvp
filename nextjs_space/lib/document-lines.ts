import Decimal from 'decimal.js';

/**
 * How an invoice or quote shows its lines and totals — shared by the PDF and
 * the detail screens so the two always read the same.
 *
 *   line "Tutar"  = quantity × unit price − line discount, before VAT
 *   "İndirim"     = column shown only when some line has a discount
 *   totals        = Ara toplam, İndirim, VAT per rate, Genel toplam
 *
 * Display only: the stored subtotal, discount, tax and total are printed as
 * they are; nothing here recomputes what the customer owes. The per-line net
 * uses the formula `lib/invoice-calc` used to compute the stored totals.
 */

const dec = (value: unknown): Decimal => {
  try {
    const d = new Decimal(String(value ?? 0));
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

/** quantity × unit price − discount, never below zero (as invoice-calc). */
export function lineNetAmount(item: any): Decimal {
  return Decimal.max(dec(item?.quantity).mul(dec(item?.unitPrice)).minus(dec(item?.discount)), 0).toDecimalPlaces(2);
}

export function hasLineDiscount(items: any[] | null | undefined): boolean {
  return (items ?? []).some((item) => dec(item?.discount).gt(0));
}

/**
 * Tax per rate, from the line items with the same formula the invoice total
 * uses: (qty × price − discount) × rate / 100. Zero-rate lines are left out;
 * the rows are ordered by rate, highest first.
 */
export function taxBreakdown(items: any[]): Array<{ rate: Decimal; base: Decimal; tax: Decimal; label: string }> {
  const byRate = new Map<string, { rate: Decimal; base: Decimal; tax: Decimal; label: string }>();
  for (const item of items ?? []) {
    const rate = dec(item?.taxRate);
    if (rate.lte(0)) continue;
    const base = Decimal.max(dec(item?.quantity).mul(dec(item?.unitPrice)).minus(dec(item?.discount)), 0);
    const key = rate.toString();
    const entry = byRate.get(key) ?? { rate, base: new Decimal(0), tax: new Decimal(0), label: String(item?.taxLabel ?? '') };
    entry.base = entry.base.plus(base);
    entry.tax = entry.tax.plus(base.mul(rate).div(100));
    byRate.set(key, entry);
  }
  return [...byRate.values()].sort((a, b) => b.rate.comparedTo(a.rate));
}

export type TotalsLine =
  | { kind: 'subtotal'; amount: string }
  | { kind: 'discount'; amount: string }
  /** `rate` is null when the stored tax cannot be tied to a rate. */
  | { kind: 'tax'; rate: Decimal | null; label: string; amount: string }
  | { kind: 'total'; amount: string };

/**
 * The totals block, top to bottom. With a single rate the stored tax total is
 * printed (it is what the total was built from); with several rates each rate
 * is printed rounded to cents, exactly as the PDF always did.
 */
export function documentTotalsLines(doc: any, options: { showTax?: boolean } = {}): TotalsLine[] {
  const lines: TotalsLine[] = [{ kind: 'subtotal', amount: dec(doc?.subtotal).toFixed(2) }];
  const discount = dec(doc?.discountTotal);
  if (discount.gt(0)) lines.push({ kind: 'discount', amount: discount.toFixed(2) });
  const taxTotal = dec(doc?.taxTotal);
  if (options.showTax !== false && taxTotal.gt(0)) {
    const breakdown = taxBreakdown(doc?.items ?? []);
    if (breakdown.length <= 1) {
      const only = breakdown[0];
      lines.push({ kind: 'tax', rate: only ? only.rate : null, label: only?.label ?? '', amount: taxTotal.toFixed(2) });
    } else {
      for (const row of breakdown) {
        lines.push({ kind: 'tax', rate: row.rate, label: row.label, amount: row.tax.toDecimalPlaces(2).toFixed(2) });
      }
    }
  }
  lines.push({ kind: 'total', amount: dec(doc?.total).toFixed(2) });
  return lines;
}

/** "%20" in Turkish, "20%" in English; up to two decimals. */
export function rateText(rate: Decimal | number | string, locale: 'tr' | 'en'): string {
  const d = dec(rate);
  const shown = d.isInteger() ? d.toString() : d.toDecimalPlaces(2).toString();
  return locale === 'tr' ? `%${shown}` : `${shown}%`;
}

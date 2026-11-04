import { vatFromGross } from '@/lib/vat-report';

/**
 * Resolves the VAT fields of an expense (amount includes VAT).
 *
 * - rate + amount given: kept, as long as the VAT is not more than the amount.
 * - only a rate: the VAT is derived, amount × rate / (100 + rate).
 * - neither / null: no VAT recorded.
 * `undefined` for taxAmount means "derive from the rate".
 */
export function resolveExpenseTax(
  amount: number,
  taxRate: number | null | undefined,
  taxAmount: number | null | undefined
):
  | { ok: true; taxRate: number | null; taxAmount: number | null }
  | { ok: false; response: { error: string; code: 'TAX_EXCEEDS_AMOUNT' } } {
  const rate = taxRate === undefined || taxRate === null ? null : taxRate;
  let vat: number | null;
  if (taxAmount !== undefined && taxAmount !== null) vat = taxAmount;
  else if (taxAmount === null && rate === null) vat = null;
  else vat = rate === null ? null : vatFromGross(amount, rate).toNumber();

  if (vat !== null && vat > amount) {
    return {
      ok: false,
      response: { error: 'The VAT cannot be more than the expense amount.', code: 'TAX_EXCEEDS_AMOUNT' },
    };
  }
  return { ok: true, taxRate: rate, taxAmount: vat };
}

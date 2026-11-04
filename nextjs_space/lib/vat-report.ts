import Decimal from 'decimal.js';

/**
 * KDV report: output VAT (hesaplanan KDV, on issued sales invoices) and input
 * VAT (indirilecek KDV, on expenses), per rate, per currency. Pure.
 *
 * - Output VAT per line uses the invoice formula
 *   (qty × price − discount) × rate / 100, so it adds up to the invoices' tax.
 * - Expense amounts include VAT. The VAT part is the stored taxAmount; when
 *   only a rate is stored it is derived as amount × rate / (100 + rate).
 *   Expenses with neither are not part of the report.
 * - Currencies are never added together.
 */

export interface VatLine {
  /** "20", "10", "1", "0" — or "?" for an input amount with no rate. */
  rate: string;
  base: string;
  tax: string;
  count: number;
}

export interface VatCurrencyReport {
  currency: string;
  output: VatLine[];
  outputBase: string;
  outputTax: string;
  input: VatLine[];
  inputBase: string;
  inputTax: string;
  /** Output minus input. Positive = payable, negative = carried forward. */
  net: string;
}

export interface VatInvoiceInput {
  currency: string;
  items: Array<{ quantity: unknown; unitPrice: unknown; discount?: unknown; taxRate?: unknown }>;
}

export interface VatExpenseInput {
  currency: string;
  amount: unknown;
  taxRate?: unknown;
  taxAmount?: unknown;
}

const D = (v: unknown) => {
  try {
    return new Decimal(v === null || v === undefined || v === '' ? 0 : String(v));
  } catch {
    return new Decimal(0);
  }
};

function rateKey(rate: Decimal): string {
  return rate.toDecimalPlaces(4).toString();
}

/** VAT inside a gross amount at a rate: amount × rate / (100 + rate). */
export function vatFromGross(amount: unknown, rate: unknown): Decimal {
  const r = D(rate);
  if (r.lte(0)) return new Decimal(0);
  return D(amount).mul(r).div(r.plus(100)).toDecimalPlaces(2);
}

/**
 * The VAT part of an expense, or null when it has none recorded.
 * `taxAmount` wins over the rate; it may never exceed the amount.
 */
export function expenseVat(expense: VatExpenseInput): Decimal | null {
  if (expense.taxAmount !== null && expense.taxAmount !== undefined && expense.taxAmount !== '') {
    return Decimal.min(D(expense.taxAmount), D(expense.amount));
  }
  if (expense.taxRate !== null && expense.taxRate !== undefined && expense.taxRate !== '') {
    return vatFromGross(expense.amount, expense.taxRate);
  }
  return null;
}

type Bucket = Map<string, { base: Decimal; tax: Decimal; count: number }>;

function add(bucket: Bucket, key: string, base: Decimal, tax: Decimal) {
  const entry = bucket.get(key) ?? { base: new Decimal(0), tax: new Decimal(0), count: 0 };
  entry.base = entry.base.plus(base);
  entry.tax = entry.tax.plus(tax);
  entry.count += 1;
  bucket.set(key, entry);
}

function lines(bucket: Bucket): VatLine[] {
  return [...bucket.entries()]
    .sort((a, b) => (a[0] === '?' ? 1 : b[0] === '?' ? -1 : Number(b[0]) - Number(a[0])))
    .map(([rate, v]) => ({ rate, base: v.base.toFixed(2), tax: v.tax.toFixed(2), count: v.count }));
}

export function buildVatReport(input: { invoices: VatInvoiceInput[]; expenses: VatExpenseInput[] }): VatCurrencyReport[] {
  const output = new Map<string, Bucket>();
  const inputs = new Map<string, Bucket>();
  const bucketFor = (map: Map<string, Bucket>, currency: string) => {
    const key = currency || 'USD';
    if (!map.has(key)) map.set(key, new Map());
    return map.get(key)!;
  };

  for (const invoice of input.invoices) {
    const bucket = bucketFor(output, invoice.currency);
    for (const item of invoice.items ?? []) {
      const rate = D(item.taxRate);
      const base = Decimal.max(D(item.quantity).mul(D(item.unitPrice)).minus(D(item.discount)), 0);
      add(bucket, rateKey(rate), base, base.mul(rate).div(100));
    }
  }

  for (const expense of input.expenses) {
    const vat = expenseVat(expense);
    if (vat === null) continue;
    const hasRate = expense.taxRate !== null && expense.taxRate !== undefined && expense.taxRate !== '';
    const key = hasRate ? rateKey(D(expense.taxRate)) : '?';
    add(bucketFor(inputs, expense.currency), key, D(expense.amount).minus(vat), vat);
  }

  const currencies = [...new Set([...output.keys(), ...inputs.keys()])].sort();
  return currencies.map((currency) => {
    const out = lines(output.get(currency) ?? new Map());
    const inn = lines(inputs.get(currency) ?? new Map());
    const sum = (rows: VatLine[], field: 'base' | 'tax') => rows.reduce((s, r) => s.plus(r[field]), new Decimal(0));
    const outTax = sum(out, 'tax');
    const inTax = sum(inn, 'tax');
    return {
      currency,
      output: out,
      outputBase: sum(out, 'base').toFixed(2),
      outputTax: outTax.toFixed(2),
      input: inn,
      inputBase: sum(inn, 'base').toFixed(2),
      inputTax: inTax.toFixed(2),
      net: outTax.minus(inTax).toFixed(2),
    };
  });
}

/** "2026-11-01".."2026-11-30" inclusive → a half-open UTC window. */
export function vatPeriod(from: string | null, to: string | null, now: Date = new Date()): { gte: Date; lt: Date; from: string; to: string } | null {
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
  let start = valid(from);
  let end = valid(to);
  if ((from && !start) || (to && !end)) return null;
  if (!start || !end) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    start = start ?? new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    end = end ?? new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  }
  const gte = new Date(`${start}T00:00:00.000Z`);
  const lt = new Date(new Date(`${end}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
  if (lt <= gte) return null;
  return { gte, lt, from: start, to: end };
}

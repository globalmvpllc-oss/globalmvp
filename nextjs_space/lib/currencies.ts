export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
] as const;

export type CurrencyCode = typeof CURRENCIES[number]['code'];

/**
 * Which locale formats each currency the way its users expect.
 *
 * This matters beyond cosmetics: tr-TR groups with '.' and uses ',' as the
 * decimal separator, so formatting Turkish Lira with en-US produced
 * "₺1,000.00" — which a Turkish reader parses as one thousandth of a lira.
 *
 *   USD  en-US  $1,000.00
 *   EUR  en-IE  €1,000.00   (symbol-first; de-DE would give "1.000,00 €")
 *   GBP  en-GB  £1,000.00
 *   TRY  tr-TR  ₺1.000,00
 */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
  TRY: 'tr-TR',
};

const DEFAULT_LOCALE = 'en-US';

export function getCurrencySymbol(code: string): string {
  const c = CURRENCIES.find((c: any) => c.code === code);
  return c?.symbol ?? code;
}

/** The locale used to format a given currency code. */
export function getCurrencyLocale(currency: string): string {
  return CURRENCY_LOCALES[currency] ?? DEFAULT_LOCALE;
}

/**
 * Formats a monetary amount for display.
 *
 * `amount` may arrive as a number or as a string: Prisma serialises Decimal
 * columns to strings over JSON, and those strings used to reach this function
 * unconverted. Coercion happens here so no caller has to remember.
 */
export function formatCurrency(amount: number | string, currency: string): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  const safe = Number.isFinite(value) ? value : 0;

  try {
    return new Intl.NumberFormat(getCurrencyLocale(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${getCurrencySymbol(currency)}${safe.toFixed(2)}`;
  }
}

/**
 * Formats a plain number (no currency symbol) using the locale that matches a
 * currency — for quantities and counts shown next to money.
 */
export function formatNumber(value: number | string, currency: string): string {
  const n = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(getCurrencyLocale(currency)).format(safe);
  } catch {
    return String(safe);
  }
}

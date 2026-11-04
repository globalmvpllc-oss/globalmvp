/**
 * Which currency a visitor is quoted in.
 *
 * Turkish lira for a visitor in Turkey or a company registered in Turkey;
 * US dollars for everyone else. The USD prices are not touched by this.
 * The country of the visitor comes from the platform (Vercel's geo header),
 * the company's from its own settings — never from anything the client sends.
 *
 * Pure, so the rule is tested directly.
 */
export type PricingCurrency = 'USD' | 'TRY';

export function pricingCurrencyFor(input: {
  visitorCountry?: string | null;
  companyCountry?: string | null;
}): PricingCurrency {
  const isTr = (value: unknown) => typeof value === 'string' && value.trim().toUpperCase() === 'TR';
  return isTr(input.companyCountry) || isTr(input.visitorCountry) ? 'TRY' : 'USD';
}

/** Polar's code for a checkout currency. */
export function polarCurrencyCode(currency: PricingCurrency): 'usd' | 'try' {
  return currency === 'TRY' ? 'try' : 'usd';
}

/**
 * Turkey-specific tax rules, kept in one place.
 *
 * Pure — no database, no environment — so it can be used by the API, the
 * forms and the PDF view model alike, and unit-tested directly.
 */

/** The KDV rates a Turkish business picks from (2023 onwards). */
export const TR_VAT_RATES = [0, 1, 10, 20] as const;

/** What a new Turkish company starts with. */
export const TR_DEFAULT_VAT_RATE = 20;
export const TR_DEFAULT_CURRENCY = 'TRY';

export function isTurkishCountry(country: unknown): boolean {
  return typeof country === 'string' && country.trim().toUpperCase() === 'TR';
}

/**
 * Defaults applied when a company is created.
 *
 * Only fills what the caller left empty: a Turkish company that deliberately
 * picked EUR keeps EUR.
 */
export function companyCreateDefaults(input: {
  country?: string | null;
  defaultCurrency?: string | null;
  defaultTaxRate?: number | null;
}): { defaultCurrency: string; defaultTaxRate: number } {
  const turkish = isTurkishCountry(input.country);
  return {
    defaultCurrency: input.defaultCurrency || (turkish ? TR_DEFAULT_CURRENCY : 'USD'),
    defaultTaxRate:
      typeof input.defaultTaxRate === 'number' && Number.isFinite(input.defaultTaxRate)
        ? input.defaultTaxRate
        : turkish
          ? TR_DEFAULT_VAT_RATE
          : 0,
  };
}

/** The label stored on a new invoice line for this company. */
export function taxLabelForCountry(country: unknown): 'KDV' | 'VAT' {
  return isTurkishCountry(country) ? 'KDV' : 'VAT';
}

/**
 * The label a reader sees for a stored line-item tax label.
 *
 * Older lines store the default 'VAT'. A Turkish reader sees 'KDV' for those;
 * a label the user typed themselves is shown as typed.
 */
export function displayTaxLabel(stored: unknown, locale: 'tr' | 'en'): string {
  const value = typeof stored === 'string' ? stored.trim() : '';
  if (value === '' || value.toUpperCase() === 'VAT' || value.toUpperCase() === 'KDV') {
    return locale === 'tr' ? 'KDV' : 'VAT';
  }
  return value;
}

/** Removes spaces and dashes people type into tax numbers. */
export function normalizeTaxId(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

/**
 * Turkish tax number check: VKN is 10 digits, TCKN is 11 digits.
 *
 * Length and digits only, as agreed; no checksum, so a correct number is never
 * refused because of an edge case in the algorithm.
 */
export function isValidTrTaxId(value: unknown): boolean {
  return /^(\d{10}|\d{11})$/.test(normalizeTaxId(value));
}

/** 'VKN' for 10 digits, 'TCKN' for 11, null otherwise. */
export function trTaxIdKind(value: unknown): 'VKN' | 'TCKN' | null {
  const digits = normalizeTaxId(value);
  if (/^\d{10}$/.test(digits)) return 'VKN';
  if (/^\d{11}$/.test(digits)) return 'TCKN';
  return null;
}

/**
 * Whether the TCKN/VKN rule applies to a party.
 *
 * It applies to a party in Turkey. A party with no country set is treated as
 * Turkish when the business itself is Turkish — the common case of a Turkish
 * company that did not bother to pick "Turkey" for every customer. A party in
 * another country keeps a free-form VAT number.
 */
export function trTaxIdRuleApplies(partyCountry: unknown, companyCountry?: unknown): boolean {
  if (typeof partyCountry === 'string' && partyCountry.trim() !== '') {
    return isTurkishCountry(partyCountry);
  }
  return isTurkishCountry(companyCountry);
}

export type DocumentLocale = 'tr' | 'en';

/**
 * The language of a document or email that goes to a customer.
 *
 * 1. the customer's own language, when set;
 * 2. otherwise their country — Turkish for Turkey, English elsewhere;
 * 3. otherwise the business's country.
 */
export function documentLocaleFor(
  customer: { language?: unknown; country?: unknown } | null | undefined,
  company: { country?: unknown } | null | undefined
): DocumentLocale {
  const language = customer?.language;
  if (language === 'tr' || language === 'en') return language;
  const country = customer?.country;
  if (typeof country === 'string' && country.trim() !== '') {
    return isTurkishCountry(country) ? 'tr' : 'en';
  }
  return isTurkishCountry(company?.country) ? 'tr' : 'en';
}

/**
 * Whether the "not an e-Arşiv/e-Fatura" notice is printed on an invoice.
 *
 * Every invoice of a Turkish company carries it until it has been issued as an
 * official e-document (Phase 4 sets `eDocumentUuid`).
 */
export function showsInformationalNotice(
  invoice: { eDocumentUuid?: unknown } | null | undefined,
  company: { country?: unknown } | null | undefined
): boolean {
  if (!isTurkishCountry(company?.country)) return false;
  return !(typeof invoice?.eDocumentUuid === 'string' && invoice.eDocumentUuid !== '');
}

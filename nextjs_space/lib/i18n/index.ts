import { en, type Dictionary, type TranslationKey } from './en';
import { tr } from './tr';

export type { TranslationKey, Dictionary };
export { en, tr };

/** Locales the application ships today. Adding one means adding a dictionary. */
export const LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * English is the default, always.
 *
 * Deliberately not derived from `Accept-Language` or `navigator.language`: a
 * Turkish-locale browser must still open the application in English until the
 * user chooses otherwise. Locale detection would also make the first server
 * render depend on a request header, which is how hydration mismatches start.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie the selected locale is stored in. Readable on the server and client. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** One year: a language choice is not something to re-ask every session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
};

const DICTIONARIES: Record<Locale, Dictionary> = { en, tr };

/** Narrows an arbitrary value to a supported locale, falling back to English. */
export function resolveLocale(value: unknown): Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

/**
 * Looks up a key in a locale, falling back to English and finally to the key.
 *
 * Returning the key rather than an empty string means a gap shows up as
 * `dashboard.revenue` on screen — obvious in review, and never a blank control.
 */
export function translate(locale: Locale, key: TranslationKey): string {
  return DICTIONARIES[locale]?.[key] ?? en[key] ?? key;
}

/**
 * Translates a key and substitutes `{placeholder}` values.
 *
 * The dictionaries carry placeholders inside the sentence — "Fatura {number}
 * vadesi geldi" — because word order differs between languages and a sentence
 * assembled by concatenating fragments can only ever be right in one of them.
 * The parity test checks that both locales keep the same placeholder set.
 *
 * A value is inserted literally and is never itself translated: it is a number,
 * a date or something the user typed.
 */
export function fillTranslation(
  locale: Locale,
  key: TranslationKey,
  values: Record<string, string | number> = {}
): string {
  return Object.entries(values).reduce<string>(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    translate(locale, key)
  );
}

/**
 * Display label for a stored category value.
 *
 * The database stores the English name ("Products") and keeps storing it; this
 * only affects what is drawn. Anything not in the seeded set — a category the
 * user created themselves — is returned unchanged, because user-entered data is
 * never translated.
 */
const CATEGORY_KEYS: Record<string, TranslationKey> = {
  Services: 'category.services',
  Products: 'category.products',
  Consulting: 'category.consulting',
  'Other Income': 'category.otherIncome',
  'Office Supplies': 'category.officeSupplies',
  Rent: 'category.rent',
  Utilities: 'category.utilities',
  Software: 'category.software',
  Marketing: 'category.marketing',
  Travel: 'category.travel',
  Insurance: 'category.insurance',
  'Other Expense': 'category.otherExpense',
};

export function categoryLabel(storedValue: unknown, locale: Locale): string {
  if (typeof storedValue !== 'string' || storedValue === '') return '';
  const key = CATEGORY_KEYS[storedValue];
  return key ? translate(locale, key) : storedValue;
}

/**
 * The BCP-47 tag to hand to Intl for a given UI locale.
 *
 * Language and currency stay separate concerns: this decides how numbers and
 * dates are *written*, never which currency a record is denominated in.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'tr' ? 'tr-TR' : 'en-US';
}

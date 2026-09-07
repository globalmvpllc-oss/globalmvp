import { en, type Dictionary, type TranslationKey } from './en';
import { tr } from './tr';

export type { TranslationKey, Dictionary };
export { en, tr };

/** Locales the application ships today. Adding one means adding a dictionary. */
export const LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * English is the fallback, and the answer whenever nothing better is known.
 *
 * This used to read "English is the default, always", and refused to look at
 * `Accept-Language` at all. That was right while every visitor was a signed-in
 * user with a settled preference, and wrong once acquisition traffic arrived:
 * someone clicking a Turkish advert has chosen nothing, and answering them in
 * English costs the click twice over.
 *
 * The rule now, in `lib/i18n/detect.ts`:
 *
 *   detection runs **only** when the NEXT_LOCALE cookie is absent.
 *
 * Once a value exists — set by the switcher, or written by that first
 * detection — the cookie decides and nothing is detected again. The old
 * guarantee therefore still holds where it mattered: a user who has chosen
 * English keeps English on a Turkish browser in Turkey, for good.
 *
 * The hydration half of the old note is still a live constraint, not a stale
 * one, and is honoured rather than dropped. The decision never reaches the
 * renderer as a header: middleware writes it into the request's cookie header
 * before the page renders, so the server render and the first client render
 * both read one value from one place — see `withLocaleCookie`.
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

/**
 * Whether a value is one of the locales this application ships.
 *
 * Distinct from `resolveLocale` on purpose: this answers "is it supported?",
 * where `resolveLocale` answers "what should I use?". Detection needs the
 * first, because an unrecognised cookie has to fall through to the next signal
 * rather than resolve to English and stop there.
 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Narrows an arbitrary value to a supported locale, falling back to English. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
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

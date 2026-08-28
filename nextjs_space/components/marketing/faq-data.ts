import { translate, type Locale, type TranslationKey } from '@/lib/i18n';

/**
 * Single source of truth for the FAQ.
 *
 * Rendered by faq.tsx and serialised into FAQPage structured data on the
 * homepage, so the markup and the schema always match exactly — and now match
 * in whichever language the page is being served in.
 *
 * Answers describe the product as it exists today. Nothing here promises
 * functionality that has not been built. The copy itself lives in
 * lib/i18n/en.ts and lib/i18n/tr.ts; only the ordering lives here.
 */
export const FAQ_KEYS: Array<{ q: TranslationKey; a: TranslationKey }> = [
  { q: 'landing.faq.q1', a: 'landing.faq.a1' },
  { q: 'landing.faq.q2', a: 'landing.faq.a2' },
  { q: 'landing.faq.q3', a: 'landing.faq.a3' },
  { q: 'landing.faq.q4', a: 'landing.faq.a4' },
  { q: 'landing.faq.q5', a: 'landing.faq.a5' },
  { q: 'landing.faq.q6', a: 'landing.faq.a6' },
  { q: 'landing.faq.q7', a: 'landing.faq.a7' },
  { q: 'landing.faq.q8', a: 'landing.faq.a8' },
];

/** The FAQ resolved into one locale. Used for the FAQPage structured data. */
export function getFaqs(locale: Locale): Array<{ q: string; a: string }> {
  return FAQ_KEYS.map((faq) => ({ q: translate(locale, faq.q), a: translate(locale, faq.a) }));
}

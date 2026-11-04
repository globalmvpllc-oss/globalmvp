import type { Metadata } from 'next';
import { getServerLocale } from './server';
import { translate, type Locale, type TranslationKey } from './index';

/**
 * Page titles and descriptions in the visitor's language.
 *
 * Read from the same NEXT_LOCALE cookie the page body uses (middleware sets it
 * on the first visit), so a Turkish visitor gets a Turkish tab title and a
 * Turkish link preview. A crawler with no cookie is answered by the same
 * detection as any first visit, so the canonical URL still serves one document.
 */

/** Open Graph locale tag for a UI locale. */
export function ogLocale(locale: Locale): string {
  return locale === 'tr' ? 'tr_TR' : 'en_US';
}

/**
 * Title + description (and the matching Open Graph fields) for one page.
 *
 * `openGraph` on a page replaces the root object instead of merging into it,
 * so the shared image and site name are restated here.
 */
export function localizedPageMetadata(options: {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  canonical: string;
  locale?: Locale;
}): Metadata {
  const locale = options.locale ?? getServerLocale();
  const title = translate(locale, options.titleKey);
  const description = translate(locale, options.descriptionKey);
  return {
    title,
    description,
    alternates: { canonical: options.canonical },
    openGraph: {
      type: 'website',
      siteName: 'CorpControl',
      title,
      description,
      url: options.canonical,
      locale: ogLocale(locale),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'CorpControl' }],
    },
  };
}

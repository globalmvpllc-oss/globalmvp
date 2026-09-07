import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  resolveLocale,
  type Locale,
} from './index';

/**
 * Which language a visitor who has never chosen one should see.
 *
 * Pure, with no request object anywhere in it — the same split as
 * `lib/active-company.ts`, so every rule below can be tested without standing
 * up a server. The middleware reads three values off the request and hands
 * them here; nothing in this file knows what a request is.
 *
 * ## Why this exists at all
 *
 * `DEFAULT_LOCALE` used to be absolute: English, always, whatever the browser
 * asked for. That was the right call for a signed-in user, who has an account
 * and a settled preference. It is the wrong call for acquisition traffic, which
 * has chosen nothing — a Turkish visitor arriving from a Turkish advert landed
 * on an English page and left.
 *
 * The rule that resolves the two: **detection runs only when there is no
 * NEXT_LOCALE cookie.** The moment a value exists — written by the language
 * switcher, or by this detection on a first visit — the cookie decides and
 * nothing here is consulted again. An explicit choice is never overridden by a
 * header or by geography, not once and not later.
 *
 * ## Order, and why it is this order
 *
 *   1. a valid cookie          — an existing decision, whoever made it
 *   2. country                 — where the request came from
 *   3. Accept-Language         — what the browser asked for
 *   4. English
 *
 * Country leads because it is the stronger signal for the traffic this is for:
 * an advert placed in Turkey, clicked in Turkey. Accept-Language is consulted
 * as well rather than instead, so a Turkish speaker abroad — whose country says
 * nothing useful — still gets Turkish.
 *
 * ## Hydration
 *
 * The old comment warned that deriving the locale from a request header is how
 * hydration mismatches start, and it was right. That is avoided by never
 * letting the decision reach the renderer as a header: the middleware writes it
 * into the request's cookie header before the page renders, so the server and
 * the first client render both read one value from one place, exactly as they
 * did when only the switcher could set it. `withLocaleCookie` below is that
 * rewrite.
 */

/**
 * Countries whose visitors get a language other than the default.
 *
 * A map rather than a hardcoded `country === 'TR'` so a second market is one
 * line and no new branch. Keys are ISO 3166-1 alpha-2, upper case.
 */
export const COUNTRY_LOCALES: Record<string, Locale> = {
  TR: 'tr',
};

/**
 * Ceiling on the Accept-Language header this will read.
 *
 * Middleware runs on every request, so the parsing below is bounded rather than
 * proportional to whatever a client sends. A real browser sends well under
 * this; anything longer is truncated, and only the entries that survive are
 * ranked. The header is ordered by preference in practice, so truncation can
 * only ever drop candidates the visitor cared least about.
 */
export const MAX_ACCEPT_LANGUAGE_CHARS = 512;

/** Ceiling on how many tags are ranked, for the same reason. */
export const MAX_LANGUAGE_TAGS = 16;

/** A well-formed language tag: 'tr', 'tr-TR', 'zh-Hant-TW'. */
const LANGUAGE_TAG = /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/;

/**
 * The language tag the visitor most wants, or null.
 *
 * Ranked by q-value, not by position: `en;q=0.5,tr;q=0.9` asks for Turkish
 * first even though English is written first, and reading the list in order
 * would get that backwards. Equal q-values keep the order they were sent in,
 * which is what the specification says they mean.
 *
 * Deliberately strict about what it will rank:
 *   - a tag that is not shaped like a language tag is skipped, so a malformed
 *     header degrades to "no preference" rather than throwing;
 *   - `q=0` means "not acceptable" and is dropped, never treated as a weak yes;
 *   - a `q=` that cannot be read as a number between 0 and 1 is treated as 0.
 *     A tag whose priority is unintelligible must not be allowed to outrank a
 *     well-formed one purely because q defaults to 1 when absent;
 *   - `*` is a wildcard, not a language, and never wins.
 */
export function preferredLanguageTag(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null;

  const trimmed = header.slice(0, MAX_ACCEPT_LANGUAGE_CHARS).trim();
  if (trimmed === '') return null;

  let best: { tag: string; q: number } | null = null;

  const parts = trimmed.split(',');
  const limit = Math.min(parts.length, MAX_LANGUAGE_TAGS);

  for (let index = 0; index < limit; index++) {
    const [rawTag, ...params] = parts[index].split(';');
    const tag = rawTag.trim().toLowerCase();
    if (tag === '' || tag === '*' || !LANGUAGE_TAG.test(tag)) continue;

    let q = 1;
    const qParam = params.find((param) => param.trim().toLowerCase().startsWith('q='));
    if (qParam !== undefined) {
      const value = Number(qParam.trim().slice(2));
      q = Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
    }
    if (q <= 0) continue;

    // Strictly greater, so an equal q leaves the earlier tag in place.
    if (best === null || q > best.q) best = { tag, q };
  }

  return best?.tag ?? null;
}

/** Where a decision came from. */
export type LocaleSource = 'cookie' | 'country' | 'language' | 'default';

export interface LocaleSignals {
  /** Raw NEXT_LOCALE cookie value, or nothing. */
  cookie?: string | null;
  /** ISO 3166-1 alpha-2 country supplied by the platform, or nothing. */
  country?: string | null;
  /** Raw Accept-Language header. */
  acceptLanguage?: string | null;
}

export interface LocaleDecision {
  locale: Locale;
  source: LocaleSource;
  /**
   * Whether the decision still has to be written to the cookie.
   *
   * False only when the cookie is where it came from — there is nothing to
   * write, and rewriting it would extend an expiry the visitor did not touch.
   */
  shouldPersist: boolean;
}

/**
 * Decides the locale for one request.
 *
 * The returned locale always goes through `resolveLocale`, so even a mistake in
 * the table above can only ever produce a supported locale, never a value the
 * dictionaries have no entry for.
 */
export function detectLocale(signals: LocaleSignals = {}): LocaleDecision {
  // 1. An existing choice, whoever made it. Checked with `isLocale` rather than
  //    `resolveLocale`, because a junk cookie must fall *through* to detection
  //    rather than silently resolving to English and stopping here.
  const cookie = typeof signals.cookie === 'string' ? signals.cookie.trim() : '';
  if (isLocale(cookie)) {
    return { locale: cookie, source: 'cookie', shouldPersist: false };
  }

  // 2. Where the request came from.
  const country = typeof signals.country === 'string' ? signals.country.trim().toUpperCase() : '';
  const byCountry = country === '' ? undefined : COUNTRY_LOCALES[country];
  if (byCountry) {
    return { locale: resolveLocale(byCountry), source: 'country', shouldPersist: true };
  }

  // 3. What the browser asked for. Only the primary subtag matters: 'tr-TR' and
  //    'tr' are the same language, and the region is already covered by step 2.
  const tag = preferredLanguageTag(signals.acceptLanguage);
  if (tag) {
    const primary = tag.split('-')[0];
    if (isLocale(primary)) {
      return { locale: resolveLocale(primary), source: 'language', shouldPersist: true };
    }
  }

  // 4. English, and remembered, so the next request skips all of the above.
  return { locale: DEFAULT_LOCALE, source: 'default', shouldPersist: true };
}

/**
 * The request's cookie header with NEXT_LOCALE set to `locale`.
 *
 * This is what makes the first response already correct rather than correct
 * from the second one onwards. A cookie set on the *response* is not visible to
 * the render that produced it, so a Turkish visitor would get an English first
 * page and Turkish only after a navigation — which is precisely the bounce this
 * change exists to prevent. Rewriting the *request* header instead means
 * `getServerLocale()` reads the decided value on this very request, and the
 * client hydrates from the same value the server rendered.
 *
 * Any existing NEXT_LOCALE pair is dropped rather than appended to, so the
 * header can never carry two of them for a parser to choose between.
 */
export function withLocaleCookie(
  cookieHeader: string | null | undefined,
  locale: Locale
): string {
  const kept =
    typeof cookieHeader === 'string'
      ? cookieHeader
          .split(';')
          .map((pair) => pair.trim())
          .filter((pair) => pair !== '' && pair.split('=')[0].trim() !== LOCALE_COOKIE)
      : [];

  kept.push(`${LOCALE_COOKIE}=${locale}`);
  return kept.join('; ');
}

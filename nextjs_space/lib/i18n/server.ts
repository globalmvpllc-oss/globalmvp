import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale, type Locale } from './index';

/**
 * The active locale, read on the server.
 *
 * Used by the root layout so the very first HTML already carries the right
 * `lang` and the right text. Reading it on the client instead would render
 * English first and swap after hydration, which is both a visible flash and a
 * hydration mismatch.
 */
export function getServerLocale(): Locale {
  return resolveLocale(cookies().get(LOCALE_COOKIE)?.value);
}

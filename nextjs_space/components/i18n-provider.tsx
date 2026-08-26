'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  intlLocale,
  translate,
  categoryLabel,
  type Locale,
  type TranslationKey,
} from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  /** Translates a key in the active locale. */
  t: (key: TranslationKey) => string;
  /** Display label for a stored category value; the stored value is unchanged. */
  category: (storedValue: unknown) => string;
  /** BCP-47 tag for Intl formatting in the active locale. */
  intl: string;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Supplies the active locale to client components.
 *
 * The initial value comes from the server, so the first client render matches
 * the HTML the server sent and there is nothing to reconcile.
 *
 * Switching locale writes the cookie and calls `router.refresh()`. That
 * re-renders server components — including the root layout, which is what
 * updates `<html lang>` — while leaving client state alone: open dialogs, form
 * values and the current route all survive. A full reload would discard them.
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  const setLocale = useCallback(
    (next: Locale) => {
      // Cookie rather than a database write: the choice has to work before
      // sign-in, and changing language should not cost a round trip to
      // Postgres. `SameSite=Lax` keeps it from riding along on cross-site
      // requests; there is nothing sensitive in it either way.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
      setLocaleState(next);
      router.refresh();
    },
    [router]
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (key: TranslationKey) => translate(locale, key),
      category: (storedValue: unknown) => categoryLabel(storedValue, locale),
      intl: intlLocale(locale),
      setLocale,
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access to the active locale and translator.
 *
 * Falls back to English rather than throwing when no provider is above it, so a
 * component rendered outside the tree degrades to readable English instead of
 * crashing the page.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    t: (key: TranslationKey) => translate(DEFAULT_LOCALE, key),
    category: (storedValue: unknown) => categoryLabel(storedValue, DEFAULT_LOCALE),
    intl: intlLocale(DEFAULT_LOCALE),
    setLocale: () => {},
  };
}

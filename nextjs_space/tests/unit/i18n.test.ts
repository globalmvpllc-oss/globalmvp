import { describe, it, expect } from 'vitest';
import {
  en,
  tr,
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  resolveLocale,
  translate,
  categoryLabel,
  intlLocale,
  type TranslationKey,
} from '@/lib/i18n';

/**
 * The rules that are easy to break silently: English staying the default, the
 * two dictionaries staying in step, and category *values* never being
 * translated in the database.
 */

describe('English is the default, and browser locale never decides', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it.each([undefined, null, '', 'de', 'tr-TR', 'en-GB', 42, {}])(
    'falls back to English for %s',
    (value) => {
      expect(resolveLocale(value)).toBe('en');
    }
  );

  it('accepts only the shipped locales', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('tr')).toBe('tr');
  });

  it('does not treat a Turkish browser tag as Turkish', () => {
    // 'tr-TR' is what navigator.language reports; selecting Turkish from it
    // would be exactly the automatic detection this must not do.
    expect(resolveLocale('tr-TR')).toBe('en');
  });
});

describe('dictionaries stay in step', () => {
  const enKeys = Object.keys(en).sort();
  const trKeys = Object.keys(tr).sort();

  it('Turkish covers every English key', () => {
    expect(trKeys).toEqual(enKeys);
  });

  it('has a label for every shipped locale', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
    }
  });

  it('writes each language name in its own language', () => {
    expect(LOCALE_LABELS.en).toBe('English');
    expect(LOCALE_LABELS.tr).toBe('Türkçe');
  });

  it('has no empty translation', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect(value.trim(), `tr.${key} is empty`).not.toBe('');
    }
  });

  it('actually translates rather than copying English', () => {
    // A handful of sentinel keys: if these match English, the file was stubbed.
    const sentinels: TranslationKey[] = ['nav.dashboard', 'common.save', 'auth.signIn'];
    for (const key of sentinels) {
      expect(tr[key]).not.toBe(en[key]);
    }
  });
});

describe('translate', () => {
  it('returns the requested locale', () => {
    expect(translate('tr', 'nav.dashboard')).toBe('Panel');
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard');
  });

  it('returns the key itself when it is unknown, never a blank label', () => {
    const missing = 'does.not.exist' as TranslationKey;
    expect(translate('tr', missing)).toBe('does.not.exist');
  });
});

describe('category labels are display-only', () => {
  it('translates a seeded category for display', () => {
    expect(categoryLabel('Products', 'tr')).toBe('Ürünler');
    expect(categoryLabel('Products', 'en')).toBe('Products');
  });

  it.each([
    ['Services', 'Hizmetler'],
    ['Office Supplies', 'Ofis Malzemeleri'],
    ['Other Income', 'Diğer Gelir'],
    ['Other Expense', 'Diğer Gider'],
  ])('maps %s to %s in Turkish', (stored, expected) => {
    expect(categoryLabel(stored, 'tr')).toBe(expected);
  });

  it('leaves a user-created category untouched', () => {
    // User-entered data is never translated, in either direction.
    expect(categoryLabel('Danışmanlık Gelirleri', 'en')).toBe('Danışmanlık Gelirleri');
    expect(categoryLabel('My Custom Category', 'tr')).toBe('My Custom Category');
  });

  it.each([null, undefined, '', 42])('returns an empty string for %s', (value) => {
    expect(categoryLabel(value, 'tr')).toBe('');
  });

  it('never maps a translated label back onto a stored value', () => {
    // The database keeps English. Feeding the Turkish label in must not
    // resolve to a different stored value — it is simply unknown.
    expect(categoryLabel('Ürünler', 'tr')).toBe('Ürünler');
  });
});

describe('Intl locale is separate from currency', () => {
  it('maps UI locale to a BCP-47 tag', () => {
    expect(intlLocale('tr')).toBe('tr-TR');
    expect(intlLocale('en')).toBe('en-US');
  });

  it('formats numbers per language while the currency is unchanged', () => {
    const amount = 1250;
    const usdInEnglish = new Intl.NumberFormat(intlLocale('en'), {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
    const usdInTurkish = new Intl.NumberFormat(intlLocale('tr'), {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

    // Same currency, different presentation — language and currency are
    // separate concepts and the stored currency is untouched.
    expect(usdInEnglish).not.toBe(usdInTurkish);
    expect(usdInEnglish).toContain('1,250');
    expect(usdInTurkish).toContain('1.250');
  });
});

describe('adding a language later', () => {
  it('needs only a dictionary, since nothing hardcodes the locale list', () => {
    expect(LOCALES).toContain('en');
    expect(LOCALES).toContain('tr');
    expect(LOCALES.length).toBe(Object.keys(LOCALE_LABELS).length);
  });
});

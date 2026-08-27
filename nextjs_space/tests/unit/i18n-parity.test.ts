import { describe, it, expect } from 'vitest';
import { en } from '@/lib/i18n/en';
import { tr } from '@/lib/i18n/tr';

/**
 * EN/TR parity.
 *
 * The Dictionary type already makes a missing or extra key a compile error, but
 * this also guards against an empty translation slipping through and against an
 * interpolation placeholder being dropped or renamed in one locale.
 */
describe('i18n EN/TR parity', () => {
  it('has an identical key set in both dictionaries', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings in either locale', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en[${key}]`).toBeTruthy();
    }
    for (const [key, value] of Object.entries(tr)) {
      expect(value, `tr[${key}]`).toBeTruthy();
    }
  });

  it('preserves interpolation placeholders across locales', () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(tr[key]), `placeholders for ${key}`).toEqual(placeholders(en[key]));
    }
  });
});

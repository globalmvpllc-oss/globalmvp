import { describe, it, expect } from 'vitest';
import { formatCurrency, getCurrencyLocale, CURRENCIES } from '@/lib/currencies';
import { toAmount, sumAmounts } from '@/lib/payment-math';
import { getMonthRange, safeTimeZone } from '@/lib/timezone';
import {
  getCompanyInitials,
  getCompanyDisplayName,
  personalizeEmptyState,
} from '@/lib/company-identity';
import { COUNTRIES, getCountryName } from '@/lib/countries';

/**
 * Task A regression tests.
 *
 * Route-level behaviour (invoice duplication, vendor creation, logo persistence)
 * needs a live database and server, so it belongs in the integration suite.
 * What is covered here is the pure logic those flows depend on.
 */

describe('currency formatting uses the right locale per currency', () => {
  it('formats each supported currency the way its users expect', () => {
    expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00');
    expect(formatCurrency(1000, 'GBP')).toBe('£1,000.00');
    expect(formatCurrency(1000, 'TRY')).toBe('₺1.000,00');
  });

  it('Turkish Lira groups with periods and separates decimals with a comma', () => {
    // The previous en-US formatting produced "₺1,000.00", which a Turkish
    // reader parses as one thousandth of a lira.
    const formatted = formatCurrency(1234.56, 'TRY');
    expect(formatted).toBe('₺1.234,56');
    expect(formatted).not.toBe('₺1,234.56');
  });

  it('maps every supported currency to a locale', () => {
    for (const c of CURRENCIES) {
      expect(getCurrencyLocale(c.code)).toBeTruthy();
    }
  });

  it('falls back to a default locale for an unknown currency', () => {
    expect(getCurrencyLocale('JPY')).toBe('en-US');
  });

  it('accepts the strings Prisma produces for Decimal columns', () => {
    expect(formatCurrency('1000.00', 'USD')).toBe('$1,000.00');
    expect(formatCurrency('1234.56', 'TRY')).toBe('₺1.234,56');
  });

  it('never renders NaN for unparseable input', () => {
    expect(formatCurrency('not a number', 'USD')).toBe('$0.00');
    expect(formatCurrency(Number.NaN, 'EUR')).toBe('€0.00');
    expect(formatCurrency(Infinity, 'GBP')).toBe('£0.00');
  });
});

describe('Decimal-as-string totals no longer produce NaN', () => {
  it('coerces the strings that arrive over JSON', () => {
    expect(toAmount('100.00')).toBe(100);
    expect(toAmount(100)).toBe(100);
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount('nonsense')).toBe(0);
  });

  it('sums string amounts instead of concatenating them', () => {
    const rows = [{ amount: '100.00' }, { amount: '50.00' }];
    const total = sumAmounts(rows, (r) => r.amount);
    expect(total).toBe(150);
    expect(Number.isNaN(total)).toBe(false);
  });

  it('reproduces the reported scenario: income 100, expense 40, profit 60', () => {
    const income = sumAmounts([{ amount: '100.00' }], (r) => r.amount);
    const expenses = sumAmounts([{ amount: '40.00' }], (r) => r.amount);
    const profit = income - expenses;

    expect(income).toBe(100);
    expect(expenses).toBe(40);
    expect(profit).toBe(60);
    expect(Number.isNaN(profit)).toBe(false);
    expect(formatCurrency(profit, 'USD')).toBe('$60.00');
  });

  it('demonstrates the old bug so the regression stays visible', () => {
    const rows = [{ amount: '100.00' }, { amount: '50.00' }];
    // The previous implementation: `s + t.amount` starting from 0.
    const buggy = rows.reduce((s: any, t: any) => s + t.amount, 0);
    expect(buggy).toBe('0100.0050.00');
    expect(Number.isNaN(Number(buggy))).toBe(true);
    // The fixed implementation.
    expect(sumAmounts(rows, (r) => r.amount)).toBe(150);
  });

  it('handles an empty list', () => {
    expect(sumAmounts([], (r: any) => r.amount)).toBe(0);
  });
});

describe('month boundaries follow the company time zone', () => {
  const august = new Date('2026-08-15T12:00:00Z');

  it('starts the month at local midnight, not UTC midnight', () => {
    const { startOfMonth } = getMonthRange('Europe/Istanbul', august);
    // Istanbul is UTC+3, so local 1 Aug 00:00 is 31 Jul 21:00 UTC.
    expect(startOfMonth.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('matches UTC when the company is in UTC', () => {
    const { startOfMonth } = getMonthRange('UTC', august);
    expect(startOfMonth.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('produces a half-open interval one month wide', () => {
    const { startOfMonth, startOfNextMonth } = getMonthRange('Europe/Istanbul', august);
    expect(startOfNextMonth.getTime()).toBeGreaterThan(startOfMonth.getTime());
    const days = (startOfNextMonth.getTime() - startOfMonth.getTime()) / 86400000;
    expect(days).toBe(31); // August
  });

  it('rolls over correctly in December', () => {
    const december = new Date('2026-12-10T12:00:00Z');
    const { startOfNextMonth } = getMonthRange('UTC', december);
    expect(startOfNextMonth.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('falls back to UTC for a missing or invalid time zone', () => {
    expect(safeTimeZone(null)).toBe('UTC');
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone('Europe/Istanbul')).toBe('Europe/Istanbul');
  });
});

describe('company identity presentation', () => {
  it('derives initials from a company name', () => {
    expect(getCompanyInitials('Acme Furniture')).toBe('AF');
    expect(getCompanyInitials('Northwind')).toBe('NO');
    expect(getCompanyInitials('Harbour and Co Limited')).toBe('HL');
  });

  it('returns nothing for a missing name so callers can choose a fallback', () => {
    expect(getCompanyInitials(undefined)).toBe('');
    expect(getCompanyInitials('')).toBe('');
    expect(getCompanyInitials('   ')).toBe('');
  });

  it('falls back to neutral wording rather than the product name', () => {
    expect(getCompanyDisplayName('Acme Furniture')).toBe('Acme Furniture');
    expect(getCompanyDisplayName(null)).toBe('Your business');
    expect(getCompanyDisplayName('  ')).toBe('Your business');
    expect(getCompanyDisplayName(null)).not.toContain('FinanceFlow');
  });

  it('names the company in empty states when one is known', () => {
    expect(personalizeEmptyState('No invoices yet', 'Acme Furniture')).toBe(
      'No invoices yet for Acme Furniture'
    );
  });

  it('leaves empty-state copy untouched when no company name exists', () => {
    expect(personalizeEmptyState('No invoices yet', null)).toBe('No invoices yet');
    expect(personalizeEmptyState('No invoices yet', '  ')).toBe('No invoices yet');
  });
});

describe('countries come from a single source', () => {
  it('exposes the codes the settings and onboarding screens rely on', () => {
    const codes = COUNTRIES.map((c) => c.code);
    for (const expected of ['US', 'GB', 'DE', 'FR', 'TR']) {
      expect(codes).toContain(expected);
    }
  });

  it('resolves a country name and falls back to the code', () => {
    expect(getCountryName('TR')).toBe('Turkey');
    expect(getCountryName('ZZ')).toBe('ZZ');
  });

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

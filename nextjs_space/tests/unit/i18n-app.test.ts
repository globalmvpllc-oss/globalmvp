import { describe, it, expect } from 'vitest';
import { en } from '@/lib/i18n/en';
import { tr } from '@/lib/i18n/tr';
import { fillTranslation, translate, categoryLabel, type TranslationKey } from '@/lib/i18n';
import { messageForStatus, pickErrorMessage, NETWORK_ERROR_MESSAGE, networkErrorMessage } from '@/lib/api-feedback';
import { INVOICE_STATUSES as STATUS_PRESENTATION, getStatusBadge } from '@/lib/invoice-helpers';
import { INVOICE_STATUSES as STORED_STATUSES } from '@/lib/invoice-status';
import { PAYMENT_METHODS, paymentMethodLabelKey } from '@/lib/validation';
import { personalizeEmptyState, getCompanyDisplayName } from '@/lib/company-identity';
import { formatCalendarDate, formatCalendarDateLong } from '@/lib/calendar-date';

/**
 * Translating the application interface.
 *
 * The parity test next door proves the two dictionaries hold the same keys.
 * This one guards the thing that parity cannot see: that translating the
 * interface did not change any value the database stores, and that the pieces
 * built for it behave.
 *
 * The rule the whole change rests on — translate the label, never the stored
 * value — is only worth stating if something checks it.
 */

describe('stored values are never translated', () => {
  it('presents exactly the statuses the state machine stores, by the same names', () => {
    expect(STATUS_PRESENTATION.map((s) => s.value).sort()).toEqual([...STORED_STATUSES].sort());
  });

  it('resolves a badge by the stored value, not by any label', () => {
    for (const status of STORED_STATUSES) {
      expect(getStatusBadge(status).value).toBe(status);
    }
    // An English label is not a stored value and must not resolve to one.
    expect(getStatusBadge('Paid').value).toBe('DRAFT'); // the documented fallback
    expect(getStatusBadge('Ödendi').value).toBe('DRAFT');
  });

  it('gives every status a label key that both dictionaries carry', () => {
    for (const status of STATUS_PRESENTATION) {
      expect(en[status.labelKey], status.value).toBeTruthy();
      expect(tr[status.labelKey], status.value).toBeTruthy();
    }
  });

  it('keeps the stored status distinct from its Turkish label', () => {
    for (const status of STATUS_PRESENTATION) {
      expect(tr[status.labelKey]).not.toBe(status.value);
    }
  });

  it('maps every stored payment method to a label, and unknown values to Other', () => {
    for (const method of PAYMENT_METHODS) {
      const key = paymentMethodLabelKey(method);
      expect(en[key]).toBeTruthy();
      expect(tr[key]).toBeTruthy();
    }
    expect(paymentMethodLabelKey('cheque')).toBe('method.other');
    expect(paymentMethodLabelKey(null)).toBe('method.other');
    expect(paymentMethodLabelKey(undefined)).toBe('method.other');
  });

  it('leaves a stored category value alone and only translates the label', () => {
    // Seeded categories have a label; anything the user typed is their own text.
    expect(categoryLabel('Software', 'tr')).toBe(tr['category.software']);
    expect(categoryLabel('Kendi kategorim', 'tr')).toBe('Kendi kategorim');
    expect(categoryLabel('', 'tr')).toBe('');
  });
});

describe('fillTranslation', () => {
  it('substitutes every occurrence of a placeholder', () => {
    expect(fillTranslation('en', 'dashboard.welcomeNamed', { name: 'Acme' })).toBe(
      'Welcome back, Acme'
    );
    expect(fillTranslation('tr', 'dashboard.welcomeNamed', { name: 'Acme' })).toContain('Acme');
  });

  it('accepts numbers and renders them as text', () => {
    expect(fillTranslation('en', 'customers.invoiceCount', { count: 3 })).toBe('3 invoices');
  });

  it('leaves a placeholder in place when no value is given', () => {
    // Better a visible {name} in review than a sentence with a hole in it.
    expect(fillTranslation('en', 'dashboard.welcomeNamed', {})).toContain('{name}');
  });

  it('does not treat a substituted value as a further placeholder', () => {
    const filled = fillTranslation('en', 'dashboard.welcomeNamed', { name: '{name}' });
    expect(filled).toBe('Welcome back, {name}');
  });
});

describe('word order is carried by the sentence, not by concatenation', () => {
  it('puts the company where each language puts it', () => {
    const base = { en: 'No invoices yet', tr: 'Henüz fatura yok' };

    expect(personalizeEmptyState(base.en, 'Acme', en['common.emptyStateFor'])).toBe(
      'No invoices yet for Acme'
    );
    // Turkish leads with the company; a hardcoded " for " could never do this.
    expect(personalizeEmptyState(base.tr, 'Acme', tr['common.emptyStateFor'])).toBe(
      'Acme için Henüz fatura yok'
    );
  });

  it('returns the base text unchanged when there is no company name', () => {
    expect(personalizeEmptyState('No invoices yet', null, tr['common.emptyStateFor'])).toBe(
      'No invoices yet'
    );
    expect(personalizeEmptyState('No invoices yet', '   ')).toBe('No invoices yet');
  });

  it('keeps the English default for a caller that passes no pattern', () => {
    expect(personalizeEmptyState('No invoices yet', 'Acme')).toBe('No invoices yet for Acme');
  });

  it('takes the company fallback from the dictionary', () => {
    expect(getCompanyDisplayName(null, tr['common.yourBusiness'])).toBe('İşletmeniz');
    expect(getCompanyDisplayName(null)).toBe('Your business');
  });
});

describe('request failures speak the reader language', () => {
  it('keeps the exact English wording when no locale is given', () => {
    expect(messageForStatus(401)).toBe('Your session has expired. Please sign in again.');
    expect(messageForStatus(404)).toBe('That record no longer exists.');
    expect(messageForStatus(500)).toBe('Something went wrong on our server. Please try again.');
  });

  it('answers in Turkish when the locale asks for it', () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 418]) {
      const turkish = messageForStatus(status, 'tr');
      expect(turkish).toBeTruthy();
      expect(turkish).not.toBe(messageForStatus(status, 'en'));
    }
  });

  it('still prefers a specific message the API wrote over a generic one', () => {
    const specific = 'Payment amount exceeds remaining balance. Maximum: 120.00';
    expect(pickErrorMessage(400, { error: specific }, 'tr')).toBe(specific);
    // An uninformative body falls through to the translated fallback.
    expect(pickErrorMessage(404, { error: 'Not found' }, 'tr')).toBe(messageForStatus(404, 'tr'));
  });

  it('offers the network message in both languages', () => {
    expect(networkErrorMessage('en')).toBe(NETWORK_ERROR_MESSAGE);
    expect(networkErrorMessage('tr')).toBe(tr['error.network']);
  });
});

describe('dates are formatted, not translated', () => {
  const day = '2026-03-01';

  it('keeps the English form when no locale is given', () => {
    expect(formatCalendarDate(day)).toBe('Mar 1, 2026');
    expect(formatCalendarDateLong(day)).toBe('March 1, 2026');
  });

  it('writes the month in the reader language without moving the day', () => {
    // Turkish leads with the day number, English with the month.
    const turkish = formatCalendarDate(day, 'MMM d, yyyy', 'tr-TR');
    expect(turkish.startsWith('1')).toBe(true);
    expect(turkish).toContain('2026');

    const english = formatCalendarDate(day, 'MMM d, yyyy', 'en-US');
    expect(english.startsWith('Mar')).toBe(true);

    // The stored value is UTC midnight; formatting must not shift it westward
    // into 28 February, which is the bug this module exists to prevent.
    expect(turkish).not.toContain('28');
    expect(english).not.toContain('28');
    expect(formatCalendarDateLong(day, 'tr-TR')).toBe('1 Mart 2026');
  });

  it('falls back to English rather than throwing on an unusable locale tag', () => {
    expect(formatCalendarDate(day, 'MMM d, yyyy', 'not a locale')).toBe('Mar 1, 2026');
    expect(formatCalendarDateLong(day, 'not a locale')).toBe('March 1, 2026');
  });
});

describe('the application dictionaries', () => {
  /** The namespaces this change introduced, and the screens behind them. */
  const NAMESPACES = [
    'common.',
    'status.',
    'method.',
    'error.',
    'app.',
    'dashboard.',
    'reports.',
    'customers.',
    'invoices.',
    'income.',
    'expenses.',
    'payments.',
    'calendar.',
    'settings.',
    'banking.',
    'vendors.',
    'statement.',
  ];

  it('carries keys for every application screen', () => {
    for (const namespace of NAMESPACES) {
      const count = Object.keys(en).filter((key) => key.startsWith(namespace)).length;
      expect(count, namespace).toBeGreaterThan(0);
    }
  });

  it('translates every application key rather than repeating the English', () => {
    // A handful are the same word in both languages, and that is correct.
    const SAME_IN_BOTH = new Set(['settings.templateModern']);

    const untranslated = (Object.keys(en) as TranslationKey[]).filter(
      (key) =>
        NAMESPACES.some((namespace) => key.startsWith(namespace)) &&
        !SAME_IN_BOTH.has(key) &&
        en[key] === tr[key]
    );
    expect(untranslated).toEqual([]);
  });

  it('falls back to English rather than to a blank label', () => {
    // A missing key shows as the key itself — obvious in review, never empty.
    expect(translate('tr', 'nav.dashboard')).toBe(tr['nav.dashboard']);
    expect(translate('tr', 'definitely.missing' as TranslationKey)).toBe('definitely.missing');
  });
});

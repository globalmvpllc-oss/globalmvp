import { describe, it, expect } from 'vitest';
import { companySchema, validateBody } from '@/lib/validation';

/**
 * Regression cover for the settings chain wired up in this pass.
 *
 * The columns and the API already existed; nothing rendered them, so these
 * values had never actually travelled from a form to the database. Once the
 * settings UI sends them, `z.coerce.number()` sees form strings — including
 * empty ones — which is where the real defect was.
 */

const base = { name: 'Acme Ltd' };

/** Every numeric setting a form can leave blank. */
const NUMERIC_SETTINGS = ['invoiceNextNumber', 'defaultPaymentTerms', 'defaultTaxRate'] as const;

describe('optional numeric settings — blank means unchanged, not zero', () => {
  it.each(NUMERIC_SETTINGS)('treats an empty string for %s as absent', (field) => {
    const { data, error } = validateBody(companySchema, { ...base, [field]: '' });
    expect(error).toBeNull();
    // The critical assertion: NOT 0. Number('') is 0, so a bare coerce would
    // silently write 0% tax or 0-day terms when a user clears the box.
    expect(data?.[field]).toBeUndefined();
  });

  it.each(NUMERIC_SETTINGS)('treats null for %s as absent', (field) => {
    const { data, error } = validateBody(companySchema, { ...base, [field]: null });
    expect(error).toBeNull();
    expect(data?.[field]).toBeUndefined();
  });

  it.each(NUMERIC_SETTINGS)('leaves %s absent when the field is not sent at all', (field) => {
    const { data, error } = validateBody(companySchema, base);
    expect(error).toBeNull();
    expect(data?.[field]).toBeUndefined();
  });
});

describe('genuine zeros are preserved', () => {
  it('keeps 0 payment terms — "due on receipt" is a real choice', () => {
    const { data, error } = validateBody(companySchema, { ...base, defaultPaymentTerms: 0 });
    expect(error).toBeNull();
    expect(data?.defaultPaymentTerms).toBe(0);
  });

  it('keeps a 0 payment term sent as the string "0" from a form', () => {
    const { data, error } = validateBody(companySchema, { ...base, defaultPaymentTerms: '0' });
    expect(error).toBeNull();
    expect(data?.defaultPaymentTerms).toBe(0);
  });

  it('keeps a 0% tax rate', () => {
    const { data, error } = validateBody(companySchema, { ...base, defaultTaxRate: 0 });
    expect(error).toBeNull();
    expect(data?.defaultTaxRate).toBe(0);
  });
});

describe('form strings are coerced', () => {
  it('accepts numeric settings sent as strings', () => {
    const { data, error } = validateBody(companySchema, {
      ...base,
      invoiceNextNumber: '42',
      defaultPaymentTerms: '14',
      defaultTaxRate: '20',
    });
    expect(error).toBeNull();
    expect(data?.invoiceNextNumber).toBe(42);
    expect(data?.defaultPaymentTerms).toBe(14);
    expect(data?.defaultTaxRate).toBe(20);
  });

  it('accepts a decimal tax rate as a string, as Prisma serialises it', () => {
    const { data } = validateBody(companySchema, { ...base, defaultTaxRate: '18.5' });
    expect(data?.defaultTaxRate).toBe(18.5);
  });
});

describe('numeric settings boundaries still reject bad input', () => {
  it.each([-1, 366, '400'])('rejects payment terms of %s', (value) => {
    const { error } = validateBody(companySchema, { ...base, defaultPaymentTerms: value });
    expect(error).not.toBeNull();
  });

  it('rejects fractional payment terms', () => {
    const { error } = validateBody(companySchema, { ...base, defaultPaymentTerms: 7.5 });
    expect(error).not.toBeNull();
  });

  it.each([-0.5, 100.01, '250'])('rejects a tax rate of %s', (value) => {
    const { error } = validateBody(companySchema, { ...base, defaultTaxRate: value });
    expect(error).not.toBeNull();
  });

  it('allows both tax rate boundaries', () => {
    expect(validateBody(companySchema, { ...base, defaultTaxRate: 0 }).error).toBeNull();
    expect(validateBody(companySchema, { ...base, defaultTaxRate: 100 }).error).toBeNull();
  });

  it('rejects a next invoice number below 1', () => {
    const { error } = validateBody(companySchema, { ...base, invoiceNextNumber: 0 });
    expect(error).not.toBeNull();
  });

  it('rejects non-numeric text rather than coercing it to NaN', () => {
    const { error } = validateBody(companySchema, { ...base, defaultTaxRate: 'twenty' });
    expect(error).not.toBeNull();
  });
});

describe('settings fields the UI now sends round-trip through validation', () => {
  it('accepts a full invoice + branding configuration', () => {
    const { data, error } = validateBody(companySchema, {
      ...base,
      invoicePrefix: 'ACME-',
      invoiceNextNumber: 7,
      defaultPaymentTerms: 7,
      defaultTaxRate: 20,
      invoiceTemplate: 'modern',
      defaultPaymentMethod: 'bank_transfer',
      invoiceShowLogo: false,
      invoiceShowTax: true,
      invoiceNotes: 'Thank you.',
      paymentInstructions: 'Pay by transfer.',
      bankTransferInstructions: 'IBAN TR00 0000',
      invoiceFooter: 'Registered in Istanbul',
      primaryColor: '#7C3AED',
      industry: 'Consulting',
    });
    expect(error).toBeNull();
    expect(data?.invoiceTemplate).toBe('modern');
    expect(data?.invoicePrefix).toBe('ACME-');
    expect(data?.invoiceShowLogo).toBe(false);
  });

  it('rejects an unknown invoice template', () => {
    const { error } = validateBody(companySchema, { ...base, invoiceTemplate: 'sparkly' });
    expect(error).not.toBeNull();
  });

  it('rejects an unsupported payment method', () => {
    const { error } = validateBody(companySchema, { ...base, defaultPaymentMethod: 'crypto' });
    expect(error).not.toBeNull();
  });

  it.each(['purple', '7C3AED', 'rgb(0,0,0)'])('rejects branding colour %s', (value) => {
    const { error } = validateBody(companySchema, { ...base, primaryColor: value });
    expect(error).not.toBeNull();
  });
});

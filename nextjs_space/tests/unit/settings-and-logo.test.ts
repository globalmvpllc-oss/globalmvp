import { describe, it, expect } from 'vitest';
import { companySchema, describeValidationError, INVOICE_TEMPLATES, PAYMENT_METHODS } from '@/lib/validation';

/**
 * Settings save and logo upload.
 *
 * The first block reproduces the bug that made "Failed to save settings"
 * unavoidable for most companies, so a regression would fail here rather than
 * in production.
 */

/** What GET /api/company returns for a company created through onboarding. */
const companyFromApi = {
  id: 'cmp_1',
  name: 'Acme Furniture',
  country: 'TR',
  defaultCurrency: 'TRY',
  timezone: 'Europe/Istanbul',
  locale: 'tr-TR',
  businessType: 'LLC',
  address: 'Bagdat Cad 1',
  city: 'Istanbul',
  state: null,
  postalCode: '34000',
  phone: null,
  email: null,
  website: null,
  taxNumber: '1234567890',
  taxOffice: 'Kadikoy',
  legalName: null,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  industry: null,
  invoicePrefix: 'INV-',
  invoiceNextNumber: 1,
  defaultPaymentTerms: 30,
  defaultTaxRate: '0.0000',
  invoiceNotes: null,
  paymentInstructions: null,
  invoiceFooter: null,
  invoiceShowLogo: true,
  invoiceShowTax: true,
  invoiceTemplate: 'classic',
  defaultPaymentMethod: null,
  bankTransferInstructions: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('settings save accepts what the API just returned', () => {
  it('round-trips the company object unchanged', () => {
    // The regression: the settings screen sends back the object it fetched.
    // Nullable columns come back as null, and `.optional()` rejects null, so
    // every company with an unset phone or website failed to save.
    const result = companySchema.safeParse(companyFromApi);
    expect(result.success).toBe(true);
  });

  it('normalises null to undefined so Prisma leaves the column alone', () => {
    const result = companySchema.parse(companyFromApi);
    expect(result.phone).toBeUndefined();
    expect(result.website).toBeUndefined();
    expect(result.legalName).toBeUndefined();
    expect(result.state).toBeUndefined();
  });

  it('rejects each nullable field individually before the fix would have', () => {
    for (const field of ['state', 'phone', 'website', 'legalName', 'email', 'logoUrl']) {
      const result = companySchema.safeParse({ ...companyFromApi, [field]: null });
      expect(result.success).toBe(true);
    }
  });

  it('accepts a Decimal tax rate serialised as a string', () => {
    // Prisma sends Decimal columns as strings over JSON.
    const result = companySchema.safeParse({ ...companyFromApi, defaultTaxRate: '18.5000' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.defaultTaxRate).toBe(18.5);
  });

  it('still requires a business name', () => {
    const result = companySchema.safeParse({ ...companyFromApi, name: '' });
    expect(result.success).toBe(false);
  });

  it('ignores fields the schema does not know about', () => {
    const result = companySchema.parse(companyFromApi);
    expect('id' in result).toBe(false);
    expect('createdAt' in result).toBe(false);
  });
});

describe('the settings fields added in Task B now persist', () => {
  it('accepts branding, invoice and payment settings together', () => {
    const result = companySchema.safeParse({
      ...companyFromApi,
      primaryColor: '#7C3AED',
      secondaryColor: '#1E40AF',
      accentColor: '#F59E0B',
      industry: 'Furniture',
      invoicePrefix: 'FTR-',
      invoiceNextNumber: 42,
      defaultPaymentTerms: 15,
      defaultTaxRate: 20,
      invoiceNotes: 'Thanks for your business',
      paymentInstructions: 'Pay by bank transfer',
      invoiceFooter: 'Registered in Istanbul',
      invoiceShowLogo: false,
      invoiceShowTax: true,
      invoiceTemplate: 'modern',
      defaultPaymentMethod: 'bank_transfer',
      bankTransferInstructions: 'IBAN on request',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primaryColor).toBe('#7C3AED');
      expect(result.data.invoicePrefix).toBe('FTR-');
      expect(result.data.defaultTaxRate).toBe(20);
      expect(result.data.invoiceShowLogo).toBe(false);
    }
  });

  it('rejects a tax rate outside 0-100 with a usable message', () => {
    const result = companySchema.safeParse({ ...companyFromApi, defaultTaxRate: 150 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const described = describeValidationError(result.error);
      expect(described.field).toBe('defaultTaxRate');
      expect(described.error).toMatch(/between 0 and 100/i);
    }
  });

  it('rejects payment terms outside 0-365 days', () => {
    expect(companySchema.safeParse({ ...companyFromApi, defaultPaymentTerms: 400 }).success).toBe(false);
    expect(companySchema.safeParse({ ...companyFromApi, defaultPaymentTerms: -1 }).success).toBe(false);
    // 0 means "due on receipt".
    expect(companySchema.safeParse({ ...companyFromApi, defaultPaymentTerms: 0 }).success).toBe(true);
  });

  it('rejects an invoice prefix with characters that do not belong in a document number', () => {
    const result = companySchema.safeParse({ ...companyFromApi, invoicePrefix: 'IN V#' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(describeValidationError(result.error).field).toBe('invoicePrefix');
    }
  });

  it('rejects an unsupported invoice template', () => {
    expect(companySchema.safeParse({ ...companyFromApi, invoiceTemplate: 'fancy' }).success).toBe(false);
    for (const template of INVOICE_TEMPLATES) {
      expect(companySchema.safeParse({ ...companyFromApi, invoiceTemplate: template }).success).toBe(true);
    }
  });

  it('rejects an unsupported payment method', () => {
    expect(companySchema.safeParse({ ...companyFromApi, defaultPaymentMethod: 'crypto' }).success).toBe(false);
    for (const method of PAYMENT_METHODS) {
      expect(companySchema.safeParse({ ...companyFromApi, defaultPaymentMethod: method }).success).toBe(true);
    }
  });

  it('rejects a colour that is not a hex value', () => {
    expect(companySchema.safeParse({ ...companyFromApi, primaryColor: 'purple' }).success).toBe(false);
    expect(companySchema.safeParse({ ...companyFromApi, primaryColor: '#7C3AED' }).success).toBe(true);
    expect(companySchema.safeParse({ ...companyFromApi, primaryColor: '#ABC' }).success).toBe(true);
  });

  it('rejects a next invoice number below one', () => {
    expect(companySchema.safeParse({ ...companyFromApi, invoiceNextNumber: 0 }).success).toBe(false);
    expect(companySchema.safeParse({ ...companyFromApi, invoiceNextNumber: 1.5 }).success).toBe(false);
  });
});

describe('validation errors name the field', () => {
  it('reports the first offending field and its message', () => {
    const result = companySchema.safeParse({ ...companyFromApi, email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const described = describeValidationError(result.error);
      expect(described.field).toBe('email');
      expect(described.error).toMatch(/valid email/i);
      expect(described.details.length).toBeGreaterThan(0);
    }
  });

  it('never returns the bare string the UI used to print', () => {
    const result = companySchema.safeParse({ ...companyFromApi, name: '' });
    if (!result.success) {
      expect(describeValidationError(result.error).error).not.toBe('Failed to save settings');
    }
  });
});

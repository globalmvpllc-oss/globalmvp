import { describe, it, expect } from 'vitest';
import { companySchema, describeValidationError, INVOICE_TEMPLATES, PAYMENT_METHODS } from '@/lib/validation';
import {
  checkUpload,
  describeStorageFailure,
  extensionOf,
  LOGO_CONTENT_TYPES,
  LOGO_FORMATS_LABEL,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from '@/lib/upload-constraints';
import { StorageConfigError, isStorageConfigError } from '@/lib/aws-config';

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

describe('logo upload checks', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size });

  it('accepts the supported logo formats', () => {
    for (const [name, type] of [['logo.png', 'image/png'], ['logo.jpg', 'image/jpeg'], ['logo.webp', 'image/webp']]) {
      const result = checkUpload(file(name, type, 50_000), LOGO_CONTENT_TYPES, LOGO_FORMATS_LABEL);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects an unsupported file type by name', () => {
    const result = checkUpload(file('logo.gif', 'image/gif', 5000), LOGO_CONTENT_TYPES, LOGO_FORMATS_LABEL);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('PNG, JPG, JPEG or WebP');
  });

  it('rejects a file over the size limit and states the limit', () => {
    const result = checkUpload(file('big.png', 'image/png', MAX_UPLOAD_BYTES + 1), LOGO_CONTENT_TYPES);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`${MAX_UPLOAD_MB} MB`);
  });

  it('rejects an empty file', () => {
    const result = checkUpload(file('empty.png', 'image/png', 0), LOGO_CONTENT_TYPES);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/empty/i);
  });

  it('catches a file renamed to disguise its type', () => {
    const result = checkUpload(file('payload.exe', 'image/png', 1000), LOGO_CONTENT_TYPES);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/extension/i);
  });

  it('tolerates a content type carrying parameters', () => {
    const result = checkUpload(file('logo.png', 'image/png; charset=binary', 1000), LOGO_CONTENT_TYPES);
    expect(result.ok).toBe(true);
  });

  it('extracts extensions, including from a file with none', () => {
    expect(extensionOf('logo.PNG')).toBe('png');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('noextension')).toBe('');
  });
});

describe('storage failures are explained rather than swallowed', () => {
  it('distinguishes the statuses S3 returns', () => {
    expect(describeStorageFailure(403)).toMatch(/rejected|expired/i);
    expect(describeStorageFailure(404)).toMatch(/could not be found/i);
    expect(describeStorageFailure(413)).toMatch(new RegExp(`${MAX_UPLOAD_MB} MB`));
    expect(describeStorageFailure(500)).toMatch(/unavailable/i);
    expect(describeStorageFailure(418)).toMatch(/could not be completed/i);
  });

  it('never returns an empty message', () => {
    for (const status of [400, 403, 404, 413, 500, 502, 503]) {
      expect(describeStorageFailure(status).length).toBeGreaterThan(0);
    }
  });
});

describe('missing storage configuration is identifiable', () => {
  it('names what is missing', () => {
    const error = new StorageConfigError(['AWS_BUCKET_NAME', 'AWS_REGION']);
    expect(error.missing).toEqual(['AWS_BUCKET_NAME', 'AWS_REGION']);
    expect(error.message).toContain('AWS_BUCKET_NAME');
  });

  it('is recognisable so the route can answer 503 instead of a generic 500', () => {
    expect(isStorageConfigError(new StorageConfigError(['AWS_REGION']))).toBe(true);
    expect(isStorageConfigError(new Error('something else'))).toBe(false);
    expect(isStorageConfigError(null)).toBe(false);
  });
});

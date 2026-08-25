import { describe, it, expect } from 'vitest';
import { buildCustomerUpdateData, optionalCustomerText } from '@/lib/customer-fields';
import { customerSchema, validateBody } from '@/lib/validation';

/**
 * Cover for making customers editable.
 *
 * The update route already existed and was correctly scoped to the caller's
 * company; what it could not do was clear a field, because it wrote
 * `data.email || undefined` and Prisma skips undefined. That only became
 * reachable once the UI could send an edit.
 */

describe('optionalCustomerText', () => {
  it('maps an empty string to null so the field is cleared', () => {
    expect(optionalCustomerText('')).toBeNull();
  });

  it('maps undefined to undefined so the field is left alone', () => {
    expect(optionalCustomerText(undefined)).toBeUndefined();
  });

  it('passes a real value through unchanged', () => {
    expect(optionalCustomerText('hello@example.com')).toBe('hello@example.com');
  });

  it('keeps whitespace rather than guessing intent', () => {
    expect(optionalCustomerText(' ')).toBe(' ');
  });
});

describe('buildCustomerUpdateData', () => {
  const full = {
    name: 'Acme Ltd',
    companyName: 'Acme',
    email: 'billing@acme.test',
    phone: '+90 555 000 0000',
    address: '1 Test Street',
    city: 'Istanbul',
    state: 'Istanbul',
    postalCode: '34000',
    country: 'TR',
    taxId: '1234567890',
    defaultCurrency: 'TRY',
    notes: 'Key account',
  };

  it('passes a complete customer through unchanged', () => {
    expect(buildCustomerUpdateData(full)).toEqual(full);
  });

  it('clears an email that the user blanked', () => {
    const result = buildCustomerUpdateData({ ...full, email: '' });
    // The regression this locks in: previously `'' || undefined` was undefined,
    // Prisma skipped the column, and the old address survived the edit.
    expect(result.email).toBeNull();
    expect(result.email).not.toBeUndefined();
  });

  it('clears a blanked default currency', () => {
    expect(buildCustomerUpdateData({ ...full, defaultCurrency: '' }).defaultCurrency).toBeNull();
  });

  it.each([
    'companyName',
    'phone',
    'address',
    'city',
    'state',
    'postalCode',
    'country',
    'taxId',
    'notes',
  ] as const)('clears %s when blanked', (field) => {
    const result = buildCustomerUpdateData({ ...full, [field]: '' });
    expect(result[field]).toBeNull();
  });

  it('leaves omitted fields undefined so they are not overwritten', () => {
    const result = buildCustomerUpdateData({ name: 'Only a name' });
    expect(result.name).toBe('Only a name');
    expect(result.email).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });

  it('never nulls the name', () => {
    expect(buildCustomerUpdateData({ name: 'Acme Ltd' }).name).toBe('Acme Ltd');
  });

  it('does not carry a companyId, so ownership can only come from the session', () => {
    const withCompany = { ...full, companyId: 'other-company' } as never;
    expect(Object.keys(buildCustomerUpdateData(withCompany))).not.toContain('companyId');
  });
});

describe('customerSchema — edit uses the same rules as create', () => {
  const valid = { name: 'Acme Ltd' };

  it('accepts a minimal customer', () => {
    expect(validateBody(customerSchema, valid).error).toBeNull();
  });

  it('requires a name', () => {
    const { error } = validateBody(customerSchema, { name: '' });
    expect(error).not.toBeNull();
  });

  it('rejects an invalid email', () => {
    expect(validateBody(customerSchema, { ...valid, email: 'not-an-email' }).error).not.toBeNull();
  });

  it('accepts an empty email so it can be removed', () => {
    expect(validateBody(customerSchema, { ...valid, email: '' }).error).toBeNull();
  });

  it('accepts a two-letter country code', () => {
    expect(validateBody(customerSchema, { ...valid, country: 'TR' }).error).toBeNull();
  });

  it('rejects a full country name, which is why the form uses a select', () => {
    // The old free-text input let users type this; the request 400'd and the
    // page said nothing at all.
    expect(validateBody(customerSchema, { ...valid, country: 'Turkey' }).error).not.toBeNull();
  });

  it('rejects an unsupported currency', () => {
    expect(validateBody(customerSchema, { ...valid, defaultCurrency: 'XYZ' }).error).not.toBeNull();
  });

  it('accepts an empty currency, meaning "use the business default"', () => {
    expect(validateBody(customerSchema, { ...valid, defaultCurrency: '' }).error).toBeNull();
  });

  it('rejects a name beyond the column length', () => {
    expect(validateBody(customerSchema, { name: 'a'.repeat(256) }).error).not.toBeNull();
  });

  it('rejects notes beyond the column length', () => {
    expect(validateBody(customerSchema, { ...valid, notes: 'a'.repeat(2001) }).error).not.toBeNull();
  });

  it('ignores a client-supplied companyId rather than trusting it', () => {
    const { data, error } = validateBody(customerSchema, { ...valid, companyId: 'attacker-company' });
    expect(error).toBeNull();
    expect((data as Record<string, unknown>)?.companyId).toBeUndefined();
  });
});

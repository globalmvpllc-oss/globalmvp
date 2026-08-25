import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { remainingForEdit, isOverpaymentForEdit, sumPaymentsExcluding } from '@/lib/payment-edit';
import { deriveStatusFromPayments } from '@/lib/invoice-status';
import { computePaymentSummary } from '@/lib/payment-math';
import { paymentUpdateSchema, validateBody } from '@/lib/validation';
import { countryLabel } from '@/lib/countries';
import { messageForStatus, pickErrorMessage } from '@/lib/api-feedback';

/**
 * Payment editing and deleting.
 *
 * The arithmetic that matters is "how much would be outstanding if this payment
 * did not exist" — the create path cannot answer that, because it counts every
 * existing payment including the one being corrected.
 */

const p = (id: string, amount: string | number) => ({ id, amount });

describe('sumPaymentsExcluding', () => {
  it('leaves out the payment being edited', () => {
    const rows = [p('a', 100), p('b', 50)];
    expect(sumPaymentsExcluding(rows, 'a').toFixed(2)).toBe('50.00');
  });

  it('returns the full sum when the id is not present', () => {
    expect(sumPaymentsExcluding([p('a', 100), p('b', 50)], 'zzz').toFixed(2)).toBe('150.00');
  });

  it('returns zero for no payments', () => {
    expect(sumPaymentsExcluding([], 'a').toFixed(2)).toBe('0.00');
  });

  it('sums Decimal-as-string amounts without floating point drift', () => {
    const rows = [p('a', '0.1'), p('b', '0.2')];
    expect(sumPaymentsExcluding(rows, 'zzz').toFixed(2)).toBe('0.30');
  });
});

describe('remainingForEdit', () => {
  it('lets a payment be raised to the full invoice total', () => {
    // 120 invoice, this is the only payment (100). Room is the whole 120,
    // not 20 — the payment must not be counted against itself.
    expect(remainingForEdit(120, [p('a', 100)], 'a').toFixed(2)).toBe('120.00');
  });

  it('accounts for other payments', () => {
    expect(remainingForEdit(120, [p('a', 100), p('b', 20)], 'a').toFixed(2)).toBe('100.00');
  });

  it('clamps to zero when other payments already cover the total', () => {
    expect(remainingForEdit(100, [p('a', 10), p('b', 100)], 'a').toFixed(2)).toBe('0.00');
  });

  it('handles a Decimal string total', () => {
    expect(remainingForEdit('99.99', [p('a', '99.99')], 'a').toFixed(2)).toBe('99.99');
  });
});

describe('isOverpaymentForEdit', () => {
  it('allows raising 100 to 120 on a 120 invoice', () => {
    expect(isOverpaymentForEdit(120, 120, [p('a', 100)], 'a')).toBe(false);
  });

  it('rejects raising past the total', () => {
    expect(isOverpaymentForEdit(120.01, 120, [p('a', 100)], 'a')).toBe(true);
  });

  it('rejects an amount that would overpay alongside a sibling payment', () => {
    // 120 invoice, sibling paid 20, so this one may reach 100 but not 101.
    expect(isOverpaymentForEdit(100, 120, [p('a', 50), p('b', 20)], 'a')).toBe(false);
    expect(isOverpaymentForEdit(101, 120, [p('a', 50), p('b', 20)], 'a')).toBe(true);
  });

  it('allows lowering a payment', () => {
    expect(isOverpaymentForEdit(10, 120, [p('a', 100)], 'a')).toBe(false);
  });

  it('treats an exact match as allowed, not an overpayment', () => {
    expect(isOverpaymentForEdit(100, 100, [p('a', 100)], 'a')).toBe(false);
  });
});

describe('invoice state follows the payment total', () => {
  it('reaches PAID when payments cover the invoice', () => {
    expect(deriveStatusFromPayments('SENT', 100, 100)).toBe('PAID');
  });

  it('is PARTIALLY_PAID for a partial payment', () => {
    expect(deriveStatusFromPayments('SENT', 40, 100)).toBe('PARTIALLY_PAID');
  });

  it('walks back from PAID to PARTIALLY_PAID when a payment is reduced', () => {
    // What a payment edit produces: recalculate re-derives from the new sum.
    expect(deriveStatusFromPayments('PAID', 40, 100)).toBe('PARTIALLY_PAID');
  });

  it('walks back to an unpaid state when the only payment is deleted', () => {
    const status = deriveStatusFromPayments('PAID', 0, 100);
    expect(status).not.toBe('PAID');
    expect(status).not.toBe('PARTIALLY_PAID');
  });

  it('never reports PAID on a zero payment total', () => {
    expect(deriveStatusFromPayments('PARTIALLY_PAID', 0, 100)).not.toBe('PAID');
  });
});

describe('computePaymentSummary still governs remaining balance', () => {
  it('reports the outstanding amount after a partial payment', () => {
    const { remaining, isFullyPaid } = computePaymentSummary(100, [{ amount: 40 }]);
    expect(remaining.toFixed(2)).toBe('60.00');
    expect(isFullyPaid).toBe(false);
  });

  it('reports fully paid at the exact total', () => {
    expect(computePaymentSummary(100, [{ amount: 100 }]).isFullyPaid).toBe(true);
  });

  it('uses Decimal arithmetic rather than floats', () => {
    const { remaining } = computePaymentSummary('0.30', [{ amount: '0.10' }, { amount: '0.20' }]);
    expect(remaining.toFixed(2)).toBe('0.00');
    expect(remaining.equals(new Decimal(0))).toBe(true);
  });
});

describe('paymentUpdateSchema', () => {
  it('accepts a partial edit that only changes the reference', () => {
    const { error } = validateBody(paymentUpdateSchema, { reference: 'WIRE-99' });
    expect(error).toBeNull();
  });

  it('accepts a full edit', () => {
    const { data, error } = validateBody(paymentUpdateSchema, {
      amount: 120.5,
      currency: 'TRY',
      paymentDate: '2026-01-15',
      paymentMethod: 'cash',
    });
    expect(error).toBeNull();
    expect(data?.amount).toBe(120.5);
  });

  it.each([0, -5])('rejects a non-positive amount (%s)', (amount) => {
    expect(validateBody(paymentUpdateSchema, { amount }).error).not.toBeNull();
  });

  it('rejects an unsupported currency', () => {
    expect(validateBody(paymentUpdateSchema, { currency: 'XYZ' }).error).not.toBeNull();
  });

  it('rejects an unsupported payment method', () => {
    expect(validateBody(paymentUpdateSchema, { paymentMethod: 'crypto' }).error).not.toBeNull();
  });

  it('rejects an unparseable date rather than storing Invalid Date', () => {
    expect(validateBody(paymentUpdateSchema, { paymentDate: 'not-a-date' }).error).not.toBeNull();
  });

  it('does not accept a target change — payments cannot be moved between invoices', () => {
    const { data } = validateBody(paymentUpdateSchema, { invoiceId: 'other-invoice', amount: 10 });
    expect((data as Record<string, unknown>)?.invoiceId).toBeUndefined();
  });

  it('ignores a client-supplied companyId', () => {
    const { data } = validateBody(paymentUpdateSchema, { companyId: 'attacker', amount: 10 });
    expect((data as Record<string, unknown>)?.companyId).toBeUndefined();
  });
});

describe('countryLabel', () => {
  it.each([
    ['TR', 'Turkey'],
    ['US', 'United States'],
    ['GB', 'United Kingdom'],
  ])('renders %s as %s', (code, expected) => {
    expect(countryLabel(code)).toBe(expected);
  });

  it('accepts a lowercase code', () => {
    expect(countryLabel('tr')).toBe('Turkey');
  });

  it('passes an unknown value through unchanged, so historic rows still render', () => {
    expect(countryLabel('Atlantis')).toBe('Atlantis');
  });

  it.each([null, undefined, ''])('returns an empty string for %s', (value) => {
    expect(countryLabel(value as string | null | undefined)).toBe('');
  });
});

describe('failed requests never read as success', () => {
  it('surfaces the overpayment message the API produced', () => {
    const msg = 'Payment amount exceeds remaining balance. Maximum: 120.00';
    expect(pickErrorMessage(400, { error: msg })).toBe(msg);
  });

  it('surfaces a currency mismatch message', () => {
    const msg = 'Payment currency (USD) must match invoice currency (TRY)';
    expect(pickErrorMessage(400, { error: msg })).toBe(msg);
  });

  it('replaces an uninformative message with a usable one', () => {
    expect(pickErrorMessage(404, { error: 'Not found' })).toBe(messageForStatus(404));
  });

  it('tells a signed-out user to sign in again', () => {
    expect(messageForStatus(401)).toBe('Your session has expired. Please sign in again.');
  });
});

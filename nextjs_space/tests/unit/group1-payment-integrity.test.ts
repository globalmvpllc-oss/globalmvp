import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computePaymentSummary, sumPayments } from '@/lib/payment-math';
import { handleApiError } from '@/lib/api-error';
import { deriveStatusFromPayments } from '@/lib/invoice-status';
import { ZodError } from 'zod';

/**
 * Group 1 — financial integrity.
 *
 * These cover the scenarios the audit called out that were not already
 * exercised by tests/unit/security-fixes.test.ts. They test the pure logic the
 * API routes depend on; the route-level guards are thin wrappers around these
 * same functions.
 *
 * True concurrency (two simultaneous POST /api/payments) cannot be proven here —
 * it depends on PostgreSQL Serializable isolation aborting one transaction, so
 * it needs an integration test against a live database.
 */

/** Mirrors the route guard: `paymentAmount.gt(remaining)` rejects the payment. */
function wouldRejectAsOverpayment(total: string, existing: string[], attempt: string): boolean {
  const { remaining } = computePaymentSummary(total, existing.map((a) => ({ amount: a })));
  return new Decimal(attempt).gt(remaining);
}

describe('expense payment ladder (audit scenario)', () => {
  it('100 expense + 1 payment => NOT paid', () => {
    const s = computePaymentSummary('100.00', [{ amount: '1.00' }]);
    expect(s.isFullyPaid).toBe(false);
    expect(s.remaining.toFixed(2)).toBe('99.00');
  });

  it('100 expense + 50 payment => partial, 50 outstanding', () => {
    const s = computePaymentSummary('100.00', [{ amount: '50.00' }]);
    expect(s.isFullyPaid).toBe(false);
    expect(s.paid.toFixed(2)).toBe('50.00');
    expect(s.remaining.toFixed(2)).toBe('50.00');
  });

  it('100 expense + 100 payment => PAID', () => {
    const s = computePaymentSummary('100.00', [{ amount: '100.00' }]);
    expect(s.isFullyPaid).toBe(true);
    expect(s.remaining.toFixed(2)).toBe('0.00');
  });

  it('100 expense + 101 payment => rejected as overpayment', () => {
    expect(wouldRejectAsOverpayment('100.00', [], '101.00')).toBe(true);
  });

  it('100 expense, 60 already paid, further 50 => rejected (only 40 remains)', () => {
    expect(wouldRejectAsOverpayment('100.00', ['60.00'], '50.00')).toBe(true);
    expect(wouldRejectAsOverpayment('100.00', ['60.00'], '40.00')).toBe(false);
  });

  it('two 50 payments reach PAID without either being rejected', () => {
    expect(wouldRejectAsOverpayment('100.00', [], '50.00')).toBe(false);
    expect(wouldRejectAsOverpayment('100.00', ['50.00'], '50.00')).toBe(false);
    const s = computePaymentSummary('100.00', [{ amount: '50.00' }, { amount: '50.00' }]);
    expect(s.isFullyPaid).toBe(true);
  });

  it('the serial overpayment the race condition used to allow is rejected once serialised', () => {
    // Two concurrent 80s against a 100 invoice: the first succeeds, and once the
    // first is visible the second must fail. Serializable isolation is what
    // guarantees the second transaction sees the first.
    expect(wouldRejectAsOverpayment('100.00', [], '80.00')).toBe(false);
    expect(wouldRejectAsOverpayment('100.00', ['80.00'], '80.00')).toBe(true);
  });
});

describe('remaining is derived from payment rows, not a stored column', () => {
  it('ignores a stale amountPaid and uses the actual rows', () => {
    // Invoice row claims 0 paid, but two payments exist.
    const s = computePaymentSummary('300.00', [{ amount: '100.00' }, { amount: '125.50' }]);
    expect(s.paid.toFixed(2)).toBe('225.50');
    expect(s.remaining.toFixed(2)).toBe('74.50');
  });

  it('sums many small payments without floating point drift', () => {
    const payments = Array.from({ length: 10 }, () => ({ amount: '0.10' }));
    expect(sumPayments(payments).toFixed(2)).toBe('1.00');
  });
});

describe('invoice status recovers when payments are removed', () => {
  it('a fully paid invoice drops out of PAID when its payments go away', () => {
    expect(deriveStatusFromPayments('PAID', 0, 100)).not.toBe('PAID');
  });

  it('a partially paid invoice reports PARTIALLY_PAID', () => {
    expect(deriveStatusFromPayments('SENT', 40, 100)).toBe('PARTIALLY_PAID');
  });

  it('DRAFT and CANCELLED are never moved by payment recalculation', () => {
    expect(deriveStatusFromPayments('DRAFT', 100, 100)).toBe('DRAFT');
    expect(deriveStatusFromPayments('CANCELLED', 100, 100)).toBe('CANCELLED');
  });
});

describe('handleApiError maps Prisma errors to correct status codes', () => {
  const prismaErr = (code: string) => ({ code, clientVersion: '6.7.0' });

  it('P2002 (duplicate invoice number) => 409, not 500', () => {
    expect(handleApiError('t', prismaErr('P2002')).status).toBe(409);
  });

  it('P2025 (record not found) => 404', () => {
    expect(handleApiError('t', prismaErr('P2025')).status).toBe(404);
  });

  it('P2003 (foreign key) => 400', () => {
    expect(handleApiError('t', prismaErr('P2003')).status).toBe(400);
  });

  it('P2034 (serialization failure) => 409 so the client can retry', () => {
    expect(handleApiError('t', prismaErr('P2034')).status).toBe(409);
  });

  it('ZodError => 400', () => {
    expect(handleApiError('t', new ZodError([])).status).toBe(400);
  });

  it('unknown errors => 500', () => {
    expect(handleApiError('t', new Error('boom')).status).toBe(500);
  });

  it('never leaks the underlying error message to the client', async () => {
    const secret = 'connect ECONNREFUSED postgresql://user:hunter2@db.host:5432/postgres';
    const res = handleApiError('t', new Error(secret), { fallbackMessage: 'Failed' });
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(body.error).toBe('Failed');
  });

  it('uses the caller-supplied conflict message for P2002', async () => {
    const res = handleApiError('t', prismaErr('P2002'), {
      conflictMessage: 'An invoice with this number already exists',
    });
    expect((await res.json()).error).toBe('An invoice with this number already exists');
  });
});

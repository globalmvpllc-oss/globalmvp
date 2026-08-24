import { describe, it, expect, beforeAll } from 'vitest';
import Decimal from 'decimal.js';
import { computePaymentSummary, sumPayments } from '../../lib/payment-math';
import { createPdfToken, verifyPdfToken } from '../../lib/pdf-token';
import { redactSecrets } from '../../lib/api-error';
import { paymentSchema, signupSchema, invoiceUpdateSchema, incomeSchema } from '../../lib/validation';

beforeAll(() => {
  // pdf-token signs with NEXTAUTH_SECRET; provide a test-only value.
  process.env.NEXTAUTH_SECRET = 'test-secret-not-a-real-key';
});

describe('computePaymentSummary — expense partial payment', () => {
  it('a 1 TRY payment against a 1000 TRY expense is NOT fully paid', () => {
    const s = computePaymentSummary('1000.00', [{ amount: '1.00' }]);
    expect(s.isFullyPaid).toBe(false);
    expect(s.paid.toFixed(2)).toBe('1.00');
    expect(s.remaining.toFixed(2)).toBe('999.00');
  });

  it('payments summing exactly to the total are fully paid', () => {
    const s = computePaymentSummary('1000.00', [{ amount: '400.00' }, { amount: '600.00' }]);
    expect(s.isFullyPaid).toBe(true);
    expect(s.remaining.toFixed(2)).toBe('0.00');
  });

  it('remaining never goes negative on overpayment', () => {
    const s = computePaymentSummary('100.00', [{ amount: '150.00' }]);
    expect(s.isFullyPaid).toBe(true);
    expect(s.remaining.toFixed(2)).toBe('0.00');
  });

  it('no payments means nothing paid', () => {
    const s = computePaymentSummary('250.00', []);
    expect(s.isFullyPaid).toBe(false);
    expect(s.paid.toFixed(2)).toBe('0.00');
    expect(s.remaining.toFixed(2)).toBe('250.00');
  });

  it('a zero-amount payable is not treated as paid', () => {
    const s = computePaymentSummary('0.00', []);
    expect(s.isFullyPaid).toBe(false);
  });

  it('sums without floating point drift', () => {
    const total = sumPayments([{ amount: '0.10' }, { amount: '0.20' }, { amount: '0.30' }]);
    expect(total.toFixed(2)).toBe('0.60');
    expect(total.equals(new Decimal('0.6'))).toBe(true);
  });

  it('remaining is exact for repeated decimal payments', () => {
    const s = computePaymentSummary('59.97', [{ amount: '19.99' }, { amount: '19.99' }]);
    expect(s.remaining.toFixed(2)).toBe('19.99');
    expect(s.isFullyPaid).toBe(false);
  });
});

describe('PDF token authorization', () => {
  it('round-trips a valid token', () => {
    const token = createPdfToken('req-123', 'company-A');
    const result = verifyPdfToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requestId).toBe('req-123');
      expect(result.companyId).toBe('company-A');
    }
  });

  it('rejects a tampered signature', () => {
    const token = createPdfToken('req-123', 'company-A');
    const [body] = token.split('.');
    const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const result = verifyPdfToken(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects a tampered payload (companyId swap)', () => {
    const token = createPdfToken('req-123', 'company-A');
    const signature = token.slice(token.lastIndexOf('.') + 1);
    const forgedBody = Buffer.from(
      JSON.stringify({ rid: 'req-123', cid: 'company-B', exp: 9999999999, jti: 'x' }),
      'utf8'
    ).toString('base64url');
    const result = verifyPdfToken(`${forgedBody}.${signature}`);
    expect(result.ok).toBe(false);
  });

  it('rejects an expired token', () => {
    const expiredBody = Buffer.from(
      JSON.stringify({ rid: 'req-1', cid: 'c1', exp: 1_000_000, jti: 'x' }),
      'utf8'
    ).toString('base64url');
    // Sign it correctly so only the expiry can fail the check.
    const validToken = createPdfToken('req-1', 'c1');
    expect(verifyPdfToken(validToken).ok).toBe(true);
    // A correctly-signed but stale token must still be refused.
    const { createHmac } = require('crypto');
    const sig = createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(expiredBody).digest('base64url');
    const result = verifyPdfToken(`${expiredBody}.${sig}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a raw request_id (the old, unauthenticated input)', () => {
    expect(verifyPdfToken('some-plain-abacus-request-id').ok).toBe(false);
  });

  it('rejects non-string and empty input', () => {
    expect(verifyPdfToken(undefined).ok).toBe(false);
    expect(verifyPdfToken(null).ok).toBe(false);
    expect(verifyPdfToken(42).ok).toBe(false);
    expect(verifyPdfToken('').ok).toBe(false);
  });

  it('two tokens for the same input are distinct', () => {
    expect(createPdfToken('r', 'c')).not.toBe(createPdfToken('r', 'c'));
  });
});

describe('payment validation', () => {
  it('rejects a payment linked to neither invoice nor expense', () => {
    const r = paymentSchema.safeParse({ amount: 100, currency: 'TRY' });
    expect(r.success).toBe(false);
  });

  it('rejects a payment linked to both', () => {
    const r = paymentSchema.safeParse({
      amount: 100,
      currency: 'TRY',
      invoiceId: 'inv1',
      expenseId: 'exp1',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a payment linked to exactly one target', () => {
    expect(paymentSchema.safeParse({ amount: 100, currency: 'TRY', invoiceId: 'inv1' }).success).toBe(true);
    expect(paymentSchema.safeParse({ amount: 100, currency: 'TRY', expenseId: 'exp1' }).success).toBe(true);
  });

  it('rejects zero and negative amounts', () => {
    expect(paymentSchema.safeParse({ amount: 0, invoiceId: 'i' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: -5, invoiceId: 'i' }).success).toBe(false);
  });

  it('rejects an unparseable payment date', () => {
    const r = paymentSchema.safeParse({ amount: 10, invoiceId: 'i', paymentDate: 'not-a-date' });
    expect(r.success).toBe(false);
  });
});

describe('invoiceUpdateSchema no longer accepts amountPaid', () => {
  it('strips a client-supplied amountPaid', () => {
    const r = invoiceUpdateSchema.safeParse({ notes: 'hi', amountPaid: 999999 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).amountPaid).toBeUndefined();
    }
  });

  it('rejects an invalid dueDate instead of passing it to Prisma', () => {
    expect(invoiceUpdateSchema.safeParse({ dueDate: 'garbage' }).success).toBe(false);
  });
});

describe('signup validation', () => {
  it('normalises email to lowercase and trims it', () => {
    const r = signupSchema.safeParse({ email: '  Test@Example.COM ', password: 'abcd1234' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('test@example.com');
  });

  it('enforces the 8 character password floor', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: '1234567' }).success).toBe(false);
    expect(signupSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true);
  });

  it('still rejects malformed emails after normalisation', () => {
    expect(signupSchema.safeParse({ email: 'NOT-AN-EMAIL', password: 'abcd1234' }).success).toBe(false);
  });
});

describe('income date and category validation', () => {
  it('rejects an invalid date string', () => {
    const r = incomeSchema.safeParse({ description: 'x', amount: 10, date: '31/02/foo' });
    expect(r.success).toBe(false);
  });

  it('accepts an ISO date', () => {
    const r = incomeSchema.safeParse({ description: 'x', amount: 10, date: '2026-08-19' });
    expect(r.success).toBe(true);
  });

  it('rejects a whitespace-only category', () => {
    expect(incomeSchema.safeParse({ description: 'x', amount: 10, category: '   ' }).success).toBe(false);
  });

  it('trims a valid category', () => {
    const r = incomeSchema.safeParse({ description: 'x', amount: 10, category: '  Services ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('Services');
  });
});

describe('error redaction', () => {
  it('removes a database URL from log text', () => {
    const msg = 'connect failed for postgresql://user:hunter2@db.example.com:5432/postgres?x=1';
    const out = redactSecrets(msg);
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]');
  });

  it('removes a bearer token', () => {
    const out = redactSecrets('Authorization: Bearer abc123.def456');
    expect(out).not.toContain('abc123');
  });
});

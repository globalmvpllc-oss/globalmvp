import { describe, it, expect, beforeAll } from 'vitest';
import Decimal from 'decimal.js';
import { calculateInvoice } from '../../lib/invoice-calc';
import { canTransition, isValidStatus, deriveStatusFromPayments } from '../../lib/invoice-status';

// ====================================================================
// Section 3: Financial Precision Tests
// ====================================================================
describe('Financial Precision (Section 3)', () => {
  it('should handle 0.10 + 0.20 + 0.30 without floating point artifacts', () => {
    const { totals, errors } = calculateInvoice([
      { description: 'A', quantity: 1, unitPrice: 0.10 },
      { description: 'B', quantity: 1, unitPrice: 0.20 },
      { description: 'C', quantity: 1, unitPrice: 0.30 },
    ]);
    expect(errors).toHaveLength(0);
    // 0.10 + 0.20 + 0.30 = 0.60 exactly (JS float would give 0.6000000000000001)
    expect(totals.total.toFixed(2)).toBe('0.60');
    expect(totals.subtotal.toFixed(2)).toBe('0.60');
  });

  it('should handle 10 × 0.10 = 1.00 exactly', () => {
    const { totals, errors } = calculateInvoice([
      { description: 'Item', quantity: 10, unitPrice: 0.10 },
    ]);
    expect(errors).toHaveLength(0);
    expect(totals.total.toFixed(2)).toBe('1.00');
  });

  it('should handle 3 × 19.99 = 59.97 exactly', () => {
    const { totals, errors } = calculateInvoice([
      { description: 'Item', quantity: 3, unitPrice: 19.99 },
    ]);
    expect(errors).toHaveLength(0);
    expect(totals.total.toFixed(2)).toBe('59.97');
  });

  it('should handle 7 × 12.75 = 89.25 exactly', () => {
    const { totals, errors } = calculateInvoice([
      { description: 'Item', quantity: 7, unitPrice: 12.75 },
    ]);
    expect(errors).toHaveLength(0);
    expect(totals.total.toFixed(2)).toBe('89.25');
  });

  it('should compute subtotal + tax - discount = total exactly with discount and tax', () => {
    // 2 × 50.00 = 100.00 subtotal, discount 10.00, taxRate 18% on (100-10)=90 → tax=16.20, total=106.20
    const { totals, errors } = calculateInvoice([
      { description: 'Item', quantity: 2, unitPrice: 50.00, discount: 10.00, taxRate: 18 },
    ]);
    expect(errors).toHaveLength(0);
    expect(totals.subtotal.toFixed(2)).toBe('100.00');
    expect(totals.discountTotal.toFixed(2)).toBe('10.00');
    expect(totals.taxTotal.toFixed(2)).toBe('16.20');
    // total = subtotal - discount + tax = 100 - 10 + 16.20 = 106.20
    expect(totals.total.toFixed(2)).toBe('106.20');
    // Verify the identity: subtotal - discountTotal + taxTotal === total
    const check = totals.subtotal.minus(totals.discountTotal).plus(totals.taxTotal);
    expect(check.equals(totals.total)).toBe(true);
  });

  it('should handle complex multi-line with mixed tax rates', () => {
    const { totals, errors } = calculateInvoice([
      { description: 'A', quantity: 3, unitPrice: 33.33, discount: 5, taxRate: 8 },
      { description: 'B', quantity: 1, unitPrice: 100, discount: 0, taxRate: 18 },
      { description: 'C', quantity: 5, unitPrice: 0.01, discount: 0, taxRate: 0 },
    ]);
    expect(errors).toHaveLength(0);
    // Verify identity holds
    const check = totals.subtotal.minus(totals.discountTotal).plus(totals.taxTotal);
    expect(check.toFixed(2)).toBe(totals.total.toFixed(2));
  });

  it('should reject zero quantity', () => {
    const { errors } = calculateInvoice([
      { description: 'Item', quantity: 0, unitPrice: 10 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('quantity'))).toBe(true);
  });

  it('should reject negative quantity', () => {
    const { errors } = calculateInvoice([
      { description: 'Item', quantity: -1, unitPrice: 10 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject negative unit price', () => {
    const { errors } = calculateInvoice([
      { description: 'Item', quantity: 1, unitPrice: -5 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject negative discount', () => {
    const { errors } = calculateInvoice([
      { description: 'Item', quantity: 1, unitPrice: 10, discount: -5 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject tax rate > 100', () => {
    const { errors } = calculateInvoice([
      { description: 'Item', quantity: 1, unitPrice: 10, taxRate: 101 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty items array', () => {
    const { errors } = calculateInvoice([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ====================================================================
// Section 5: Invoice Status State Machine Tests
// ====================================================================
describe('Invoice Status State Machine (Section 5)', () => {
  it('DRAFT → SENT is valid', () => expect(canTransition('DRAFT', 'SENT')).toBe(true));
  it('SENT → VIEWED is valid', () => expect(canTransition('SENT', 'VIEWED')).toBe(true));
  it('SENT → PAID is valid', () => expect(canTransition('SENT', 'PAID')).toBe(true));
  it('SENT → OVERDUE is valid', () => expect(canTransition('SENT', 'OVERDUE')).toBe(true));
  it('PARTIALLY_PAID → PAID is valid', () => expect(canTransition('PARTIALLY_PAID', 'PAID')).toBe(true));
  it('DRAFT → CANCELLED is valid', () => expect(canTransition('DRAFT', 'CANCELLED')).toBe(true));
  
  it('PAID → DRAFT is INVALID', () => expect(canTransition('PAID', 'DRAFT')).toBe(false));
  it('PAID → SENT is INVALID', () => expect(canTransition('PAID', 'SENT')).toBe(false));
  it('CANCELLED → PAID is INVALID', () => expect(canTransition('CANCELLED', 'PAID')).toBe(false));
  it('CANCELLED → SENT is INVALID', () => expect(canTransition('CANCELLED', 'SENT')).toBe(false));
  it('PAID → CANCELLED is INVALID', () => expect(canTransition('PAID', 'CANCELLED')).toBe(false));
  it('DRAFT → PAID is INVALID (skip)', () => expect(canTransition('DRAFT', 'PAID')).toBe(false));
  it('DRAFT → OVERDUE is INVALID', () => expect(canTransition('DRAFT', 'OVERDUE')).toBe(false));

  it('isValidStatus rejects garbage', () => {
    expect(isValidStatus('GARBAGE')).toBe(false);
    expect(isValidStatus('')).toBe(false);
  });

  it('isValidStatus accepts all valid statuses', () => {
    for (const s of ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']) {
      expect(isValidStatus(s)).toBe(true);
    }
  });

  describe('deriveStatusFromPayments', () => {
    it('returns PAID when amountPaid >= total', () => {
      expect(deriveStatusFromPayments('SENT', 100, 100)).toBe('PAID');
      expect(deriveStatusFromPayments('PARTIALLY_PAID', 150, 100)).toBe('PAID');
    });
    it('returns PARTIALLY_PAID when amountPaid > 0 but < total', () => {
      expect(deriveStatusFromPayments('SENT', 50, 100)).toBe('PARTIALLY_PAID');
    });
    it('preserves DRAFT/CANCELLED regardless of payments', () => {
      expect(deriveStatusFromPayments('DRAFT', 0, 100)).toBe('DRAFT');
      expect(deriveStatusFromPayments('CANCELLED', 0, 100)).toBe('CANCELLED');
    });
  });
});

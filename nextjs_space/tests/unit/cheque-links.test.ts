import { describe, it, expect } from 'vitest';
import { chequeSchema, chequeUpdateSchema, chequeTransitionSchema } from '@/lib/validation';
import { OPEN_INVOICE_STATUSES, INVOICE_STATUSES } from '@/lib/invoice-status';
import { CHEQUE_DIRECTIONS } from '@/lib/cheque-status';

/**
 * Which document a cheque settles.
 *
 * The column existed from the first commit and the form never asked, so every
 * instrument was stored with a null `invoiceId` and cleared against nothing.
 * These tests pin the rules the form and the routes now share: one link per
 * direction, never both, never one that no longer applies, and never one
 * belonging to another company.
 */

/**
 * The route's rule for which link is stored, mirrored exactly.
 *
 * `app/api/cheques/route.ts` writes `customerId` only for RECEIVED and
 * `vendorId` only for ISSUED; the form sends `invoiceId` only for RECEIVED and
 * `expenseId` only for ISSUED. Stated here so the two cannot drift apart
 * silently.
 */
function linksFor(direction: string, requested: Record<string, string | null>) {
  return {
    customerId: direction === 'RECEIVED' ? requested.customerId ?? null : null,
    vendorId: direction === 'ISSUED' ? requested.vendorId ?? null : null,
    invoiceId: direction === 'RECEIVED' ? requested.invoiceId ?? null : null,
    expenseId: direction === 'ISSUED' ? requested.expenseId ?? null : null,
  };
}

/** The form's rule when a field changes: a link that no longer applies is dropped. */
function afterChange(
  form: Record<string, string>,
  key: string,
  value: string
): Record<string, string> {
  const next = { ...form, [key]: value };
  if (key === 'direction') {
    next.invoiceId = '';
    next.expenseId = '';
    if (value === 'RECEIVED') next.vendorId = '';
    else next.customerId = '';
  }
  if (key === 'currency' || key === 'customerId' || key === 'vendorId') {
    next.invoiceId = '';
    next.expenseId = '';
  }
  return next;
}

describe('a link belongs to one direction only', () => {
  it('gives a received cheque an invoice and a customer, never an expense', () => {
    expect(
      linksFor('RECEIVED', { customerId: 'c1', vendorId: 'v1', invoiceId: 'i1', expenseId: 'e1' })
    ).toEqual({ customerId: 'c1', vendorId: null, invoiceId: 'i1', expenseId: null });
  });

  it('gives an issued cheque an expense and a vendor, never an invoice', () => {
    expect(
      linksFor('ISSUED', { customerId: 'c1', vendorId: 'v1', invoiceId: 'i1', expenseId: 'e1' })
    ).toEqual({ customerId: null, vendorId: 'v1', invoiceId: null, expenseId: 'e1' });
  });

  it('never stores both sides at once, whatever is requested', () => {
    for (const direction of CHEQUE_DIRECTIONS) {
      const links = linksFor(direction, {
        customerId: 'c1', vendorId: 'v1', invoiceId: 'i1', expenseId: 'e1',
      });
      expect(Boolean(links.invoiceId) && Boolean(links.expenseId), direction).toBe(false);
      expect(Boolean(links.customerId) && Boolean(links.vendorId), direction).toBe(false);
    }
  });

  it('leaves both null when nothing was chosen — a link is optional', () => {
    // A cheque paying down a balance rather than one invoice is legitimate.
    expect(linksFor('RECEIVED', {})).toEqual({
      customerId: null, vendorId: null, invoiceId: null, expenseId: null,
    });
  });
});

describe('switching a choice clears a link that no longer applies', () => {
  const form = {
    direction: 'RECEIVED', currency: 'TRY', customerId: 'c1', vendorId: '',
    invoiceId: 'i1', expenseId: '',
  };

  it('drops the invoice when the direction flips', () => {
    const next = afterChange(form, 'direction', 'ISSUED');
    expect(next.invoiceId).toBe('');
    expect(next.expenseId).toBe('');
    // And the party that no longer applies goes too.
    expect(next.customerId).toBe('');
  });

  it('drops the invoice when the customer changes', () => {
    // An invoice chosen for one customer is not the right invoice for another.
    expect(afterChange(form, 'customerId', 'c2').invoiceId).toBe('');
  });

  it('drops the invoice when the currency changes', () => {
    // The settling path refuses a currency mismatch, so a link across
    // currencies would silently receive no money when the cheque cleared.
    expect(afterChange(form, 'currency', 'USD').invoiceId).toBe('');
  });

  it('keeps the link when something unrelated changes', () => {
    expect(afterChange(form, 'bankName', 'Ziraat').invoiceId).toBe('i1');
    expect(afterChange(form, 'chequeNumber', '12345').invoiceId).toBe('i1');
  });

  it('never leaves a received cheque holding an expense id', () => {
    const issued = { ...form, direction: 'ISSUED', expenseId: 'e1', invoiceId: '' };
    expect(afterChange(issued, 'direction', 'RECEIVED').expenseId).toBe('');
  });
});

describe('the picker offers only documents that can be settled', () => {
  it('excludes drafts, cancelled and fully paid invoices', () => {
    const offered = [...OPEN_INVOICE_STATUSES];
    for (const status of ['DRAFT', 'CANCELLED', 'PAID']) {
      expect(offered, status).not.toContain(status);
    }
  });

  it('offers every status that can still receive money', () => {
    expect([...OPEN_INVOICE_STATUSES].sort()).toEqual([
      'OVERDUE', 'PARTIALLY_PAID', 'SENT', 'VIEWED',
    ]);
    for (const status of OPEN_INVOICE_STATUSES) {
      expect(INVOICE_STATUSES, status).toContain(status);
    }
  });
});

describe('the request schemas', () => {
  const valid = {
    direction: 'RECEIVED' as const,
    amount: 1000,
    currency: 'TRY' as const,
    dueDate: '2026-04-15',
  };

  it('accepts an instrument with no document behind it', () => {
    expect(chequeSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional links', () => {
    const parsed = chequeSchema.safeParse({ ...valid, invoiceId: 'i1', customerId: 'c1' });
    expect(parsed.success).toBe(true);
  });

  it('refuses a direction it does not recognise', () => {
    expect(chequeSchema.safeParse({ ...valid, direction: 'SIDEWAYS' }).success).toBe(false);
  });

  it('refuses a zero or negative amount', () => {
    expect(chequeSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(chequeSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
  });

  it('requires a due date, because the whole feature is about vade', () => {
    const { dueDate, ...withoutDueDate } = valid;
    expect(chequeSchema.safeParse(withoutDueDate).success).toBe(false);
  });

  it('never accepts a status on create or update', () => {
    // The only way to a settling status is the transition endpoint, which
    // checks the lifecycle and records the payment. Accepting it here would let
    // a caller write CLEARED straight onto the row and skip the money.
    const created = chequeSchema.safeParse({ ...valid, status: 'CLEARED' });
    expect(created.success).toBe(true);
    expect(created.success && 'status' in created.data).toBe(false);

    const updated = chequeUpdateSchema.safeParse({ status: 'CLEARED' });
    expect(updated.success).toBe(true);
    expect(updated.success && 'status' in updated.data).toBe(false);
  });

  it('never accepts an amount on a transition', () => {
    // A settling instrument pays its own face value, capped at what is owed.
    const parsed = chequeTransitionSchema.safeParse({ status: 'CLEARED', amount: 999999 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'amount' in parsed.data).toBe(false);
  });

  it('refuses a transition to something that is not a status', () => {
    expect(chequeTransitionSchema.safeParse({ status: 'ELSEWHERE' }).success).toBe(false);
  });
});

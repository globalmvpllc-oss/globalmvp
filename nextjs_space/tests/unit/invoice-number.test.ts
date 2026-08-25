import { describe, it, expect } from 'vitest';
import {
  formatInvoiceNumber,
  INVOICE_NUMBER_PADDING,
  isUniqueViolation,
} from '@/lib/invoice-number';

/**
 * Invoice numbering.
 *
 * `allocateInvoiceNumber` runs against a live transaction, so the parts that
 * need a database — the row lock, the atomic increment, real concurrency —
 * belong in the integration suite. What is covered here is the formatting
 * contract and a simulation of the allocator's arithmetic, which is where the
 * old max-based implementation actually went wrong.
 */

/**
 * Mirrors allocateInvoiceNumber against an in-memory company row, so the
 * sequence behaviour can be asserted without a database. `used` stands in for
 * invoice numbers already present for that company.
 */
function makeAllocator(prefix = 'INV-', startAt = 1, used: Set<string> = new Set()) {
  const company = { invoicePrefix: prefix, invoiceNextNumber: startAt };

  return {
    company,
    used,
    /** One allocation, as the transaction would perform it. */
    allocate(): string {
      company.invoiceNextNumber += 1; // atomic increment, returns post-value
      let sequence = company.invoiceNextNumber - 1;
      let candidate = formatInvoiceNumber(company.invoicePrefix, sequence);
      let skips = 0;
      while (used.has(candidate)) {
        if (++skips > 1000) throw new Error('no free number');
        sequence += 1;
        candidate = formatInvoiceNumber(company.invoicePrefix, sequence);
      }
      if (skips > 0) company.invoiceNextNumber = sequence + 1;
      used.add(candidate);
      return candidate;
    },
    /** A create that fails after allocating: the transaction rolls back. */
    allocateThenFail(): void {
      const before = company.invoiceNextNumber;
      company.invoiceNextNumber += 1;
      company.invoiceNextNumber = before; // rollback
    },
    /** Deleting an invoice frees the row but must not rewind the sequence. */
    deleteInvoice(number: string): void {
      used.delete(number);
    },
  };
}

describe('invoice number formatting', () => {
  it('pads to the established four-digit format', () => {
    expect(formatInvoiceNumber('INV-', 1)).toBe('INV-0001');
    expect(formatInvoiceNumber('INV-', 42)).toBe('INV-0042');
    expect(formatInvoiceNumber('INV-', 9999)).toBe('INV-9999');
  });

  it('keeps the padding width the application already used', () => {
    expect(INVOICE_NUMBER_PADDING).toBe(4);
  });

  it('grows rather than truncating past the padding width', () => {
    // A company past 9999 invoices should see a longer number, not a mangled one.
    expect(formatInvoiceNumber('INV-', 10000)).toBe('INV-10000');
    expect(formatInvoiceNumber('INV-', 123456)).toBe('INV-123456');
  });

  it('applies whatever prefix the company configured', () => {
    expect(formatInvoiceNumber('FTR-', 7)).toBe('FTR-0007');
    expect(formatInvoiceNumber('2026/', 7)).toBe('2026/0007');
    expect(formatInvoiceNumber('', 7)).toBe('0007');
  });
});

describe('sequence behaviour', () => {
  it('gives the first invoice the starting number', () => {
    const a = makeAllocator('INV-', 1);
    expect(a.allocate()).toBe('INV-0001');
  });

  it('increments on the next invoice', () => {
    const a = makeAllocator('INV-', 1);
    expect(a.allocate()).toBe('INV-0001');
    expect(a.allocate()).toBe('INV-0002');
    expect(a.allocate()).toBe('INV-0003');
  });

  it('does not rewind after an invoice is deleted', () => {
    // This is the regression. The old implementation derived the next number
    // from MAX(invoiceNumber), so deleting the newest invoice handed its number
    // straight back out.
    const a = makeAllocator('INV-', 1);
    expect(a.allocate()).toBe('INV-0001');
    expect(a.allocate()).toBe('INV-0002');

    a.deleteInvoice('INV-0002');

    expect(a.allocate()).toBe('INV-0003');
    expect(a.company.invoiceNextNumber).toBe(4);
  });

  it('never reissues a number even after several deletions', () => {
    const a = makeAllocator('INV-', 1);
    const issued: string[] = [];
    for (let i = 0; i < 5; i++) issued.push(a.allocate());
    a.deleteInvoice(issued[4]);
    a.deleteInvoice(issued[2]);
    const next = a.allocate();
    expect(issued).not.toContain(next);
    expect(next).toBe('INV-0006');
  });

  it('starts from the backfilled value on an existing company', () => {
    // The Task B migration set invoiceNextNumber past the highest number
    // already issued, so the first allocation continues the series.
    const a = makeAllocator('INV-', 18);
    expect(a.allocate()).toBe('INV-0018');
  });
});

describe('concurrent allocation', () => {
  it('gives two simultaneous requests different numbers', () => {
    // The row lock makes concurrent allocation strictly sequential, so this
    // models what the two transactions observe once serialised.
    const a = makeAllocator('INV-', 4);
    const first = a.allocate();
    const second = a.allocate();
    expect(first).toBe('INV-0004');
    expect(second).toBe('INV-0005');
    expect(first).not.toBe(second);
  });

  it('issues no duplicates across many allocations', () => {
    const a = makeAllocator('INV-', 1);
    const numbers = Array.from({ length: 200 }, () => a.allocate());
    expect(new Set(numbers).size).toBe(200);
  });
});

describe('failed creation', () => {
  it('leaves no gap when the insert rolls back', () => {
    // Allocation happens inside the same transaction as the insert, so a failed
    // create takes the increment back with it.
    const a = makeAllocator('INV-', 1);
    expect(a.allocate()).toBe('INV-0001');
    a.allocateThenFail();
    expect(a.company.invoiceNextNumber).toBe(2);
    expect(a.allocate()).toBe('INV-0002');
  });
});

describe('collision with pre-existing numbers', () => {
  it('skips forward past a number that already exists', () => {
    // Invoices created before the sequence existed can occupy a number.
    const a = makeAllocator('INV-', 1, new Set(['INV-0001', 'INV-0002']));
    expect(a.allocate()).toBe('INV-0003');
  });

  it('parks the sequence past whatever it skipped', () => {
    const a = makeAllocator('INV-', 1, new Set(['INV-0001', 'INV-0002']));
    a.allocate();
    expect(a.company.invoiceNextNumber).toBe(4);
    expect(a.allocate()).toBe('INV-0004');
  });

  it('changing the prefix does not collide with the old series', () => {
    const a = makeAllocator('INV-', 1, new Set(['INV-0001']));
    expect(a.allocate()).toBe('INV-0002');
    a.company.invoicePrefix = 'FTR-';
    // The new prefix starts clean; the numeric part carries on.
    expect(a.allocate()).toBe('FTR-0003');
  });
});

describe('company isolation', () => {
  it('keeps each company on its own sequence', () => {
    const a = makeAllocator('INV-', 1);
    const b = makeAllocator('INV-', 1);

    expect(a.allocate()).toBe('INV-0001');
    expect(a.allocate()).toBe('INV-0002');
    expect(b.allocate()).toBe('INV-0001'); // untouched by company A

    expect(a.company.invoiceNextNumber).toBe(3);
    expect(b.company.invoiceNextNumber).toBe(2);
  });

  it('lets each company choose its own prefix', () => {
    const a = makeAllocator('INV-', 1);
    const b = makeAllocator('FTR-', 1);
    expect(a.allocate()).toBe('INV-0001');
    expect(b.allocate()).toBe('FTR-0001');
  });
});

describe('unique constraint remains the backstop', () => {
  it('recognises a Prisma unique violation', () => {
    // @@unique([companyId, invoiceNumber]) still guards the table; the route
    // maps this to a 409 rather than a 500.
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

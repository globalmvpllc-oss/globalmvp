import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  ISSUED_INVOICE_STATUSES,
  UNISSUED_INVOICE_STATUSES,
  OPEN_INVOICE_STATUSES,
  INVOICE_STATUSES,
  isIssuedInvoice,
} from '@/lib/invoice-status';
import {
  customerMovements,
  outstandingByCurrency,
  reconcileStatement,
  type LedgerInvoice,
} from '@/lib/statement-sources';
import { buildStatement } from '@/lib/statement-ledger';

/**
 * What a customer owes.
 *
 * The customer detail cards summed invoices of every status, so a business with
 * four drafts it had never sent was told a customer owed it $5,841 and €24,992.
 * A draft is a document being written; presenting it as a receivable is not a
 * rounding difference, it is a figure that is simply untrue.
 *
 * These tests pin the arithmetic behind those cards, and — the assertion that
 * matters most — that the cards and the statement drawn directly beneath them
 * cannot drift apart again.
 */

/**
 * The customer card arithmetic, exactly as app/api/customers/[id]/route.ts
 * computes it: group per currency, skip anything unissued.
 */
function cards(
  invoices: Array<Pick<LedgerInvoice, 'status' | 'currency' | 'total' | 'amountPaid'>>
): Record<string, { totalInvoiced: string; totalPaid: string; outstanding: string }> {
  const per = new Map<string, { invoiced: Decimal; paid: Decimal }>();
  for (const invoice of invoices) {
    if (!isIssuedInvoice(invoice.status)) continue;
    const currency = invoice.currency || 'USD';
    const bucket = per.get(currency) ?? { invoiced: new Decimal(0), paid: new Decimal(0) };
    bucket.invoiced = bucket.invoiced.plus(new Decimal(String(invoice.total)));
    bucket.paid = bucket.paid.plus(new Decimal(String(invoice.amountPaid)));
    per.set(currency, bucket);
  }

  const out: Record<string, { totalInvoiced: string; totalPaid: string; outstanding: string }> = {};
  for (const [currency, b] of per.entries()) {
    out[currency] = {
      totalInvoiced: b.invoiced.toFixed(2),
      totalPaid: b.paid.toFixed(2),
      outstanding: b.invoiced.minus(b.paid).toFixed(2),
    };
  }
  return out;
}

const invoice = (
  over: Partial<LedgerInvoice> & { id: string; status: string }
): LedgerInvoice => ({
  invoiceNumber: `INV-${over.id}`,
  currency: 'USD',
  total: '1000.00',
  amountPaid: '0.00',
  issueDate: '2026-03-01',
  ...over,
});

describe('the status sets', () => {
  it('cover every stored status exactly once between them', () => {
    expect([...ISSUED_INVOICE_STATUSES, ...UNISSUED_INVOICE_STATUSES].sort()).toEqual(
      [...INVOICE_STATUSES].sort()
    );
  });

  it('treat a draft and a cancelled invoice as no claim on anybody', () => {
    expect([...UNISSUED_INVOICE_STATUSES]).toEqual(['DRAFT', 'CANCELLED']);
    for (const status of UNISSUED_INVOICE_STATUSES) {
      expect(isIssuedInvoice(status), status).toBe(false);
    }
  });

  it('treat every issued status as real money', () => {
    for (const status of ISSUED_INVOICE_STATUSES) {
      expect(isIssuedInvoice(status), status).toBe(true);
    }
  });

  it('make every open invoice an issued one, but not the reverse', () => {
    for (const status of OPEN_INVOICE_STATUSES) {
      expect(isIssuedInvoice(status), status).toBe(true);
    }
    // PAID is issued but not open: it can receive no more money.
    expect((OPEN_INVOICE_STATUSES as readonly string[]).includes('PAID')).toBe(false);
    expect(isIssuedInvoice('PAID')).toBe(true);
  });

  it('answers no for anything that is not a status at all', () => {
    for (const value of [null, undefined, '', 'draft', 'Paid', 42, {}]) {
      expect(isIssuedInvoice(value)).toBe(false);
    }
  });
});

describe('a draft contributes nothing', () => {
  it('adds to neither invoiced, paid nor outstanding', () => {
    expect(cards([invoice({ id: '1', status: 'DRAFT', total: '5000.00' })])).toEqual({});
  });

  it('does not move a figure that other invoices produced', () => {
    const withoutDraft = cards([invoice({ id: '1', status: 'SENT', total: '1000.00' })]);
    const withDraft = cards([
      invoice({ id: '1', status: 'SENT', total: '1000.00' }),
      invoice({ id: '2', status: 'DRAFT', total: '9999.00' }),
    ]);
    expect(withDraft).toEqual(withoutDraft);
  });

  it('is ignored even when it carries a payment', () => {
    // amountPaid on an unissued document is not collected revenue either.
    expect(cards([invoice({ id: '1', status: 'DRAFT', total: '500.00', amountPaid: '200.00' })])).toEqual(
      {}
    );
  });
});

describe('a cancelled invoice contributes nothing', () => {
  it('adds to neither invoiced, paid nor outstanding', () => {
    expect(cards([invoice({ id: '1', status: 'CANCELLED', total: '5000.00' })])).toEqual({});
  });
});

describe('every issued status contributes as before', () => {
  it('counts SENT, VIEWED, PARTIALLY_PAID, PAID and OVERDUE', () => {
    const rows = ISSUED_INVOICE_STATUSES.map((status, index) =>
      invoice({ id: String(index), status, total: '100.00', amountPaid: '40.00' })
    );
    const total = (ISSUED_INVOICE_STATUSES.length * 100).toFixed(2);
    const paid = (ISSUED_INVOICE_STATUSES.length * 40).toFixed(2);
    const outstanding = (ISSUED_INVOICE_STATUSES.length * 60).toFixed(2);

    expect(cards(rows)).toEqual({
      USD: { totalInvoiced: total, totalPaid: paid, outstanding },
    });
  });

  it('still counts a fully paid invoice as invoiced and paid', () => {
    // Excluding PAID would report a customer who settled everything as never
    // having been billed.
    expect(cards([invoice({ id: '1', status: 'PAID', total: '900.00', amountPaid: '900.00' })])).toEqual(
      { USD: { totalInvoiced: '900.00', totalPaid: '900.00', outstanding: '0.00' } }
    );
  });
});

describe('a customer whose invoices are all drafts', () => {
  it('shows zero, not a large number', () => {
    // The production case, to the cent: Fida HorecaNew, four drafts.
    const drafts = [
      invoice({ id: '1', status: 'DRAFT', currency: 'USD', total: '5841.00' }),
      invoice({ id: '2', status: 'DRAFT', currency: 'EUR', total: '24992.00' }),
    ];
    expect(cards(drafts)).toEqual({});
    expect(outstandingByCurrency(drafts, 'USD')).toEqual({});

    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices: drafts, payments: [], income: [] }),
    });
    expect(statement.hasMovements).toBe(false);
    expect(statement.byCurrency.USD.accountBalance).toBe('0.00');
  });
});

describe('per-currency separation still holds', () => {
  it('keeps two currencies apart and never sums across them', () => {
    expect(
      cards([
        invoice({ id: '1', status: 'SENT', currency: 'USD', total: '1000.00', amountPaid: '250.00' }),
        invoice({ id: '2', status: 'SENT', currency: 'EUR', total: '500.00', amountPaid: '0.00' }),
        invoice({ id: '3', status: 'DRAFT', currency: 'EUR', total: '9999.00' }),
      ])
    ).toEqual({
      USD: { totalInvoiced: '1000.00', totalPaid: '250.00', outstanding: '750.00' },
      EUR: { totalInvoiced: '500.00', totalPaid: '0.00', outstanding: '500.00' },
    });
  });

  it('drops a currency whose only invoices are unissued', () => {
    const result = cards([
      invoice({ id: '1', status: 'SENT', currency: 'USD', total: '100.00' }),
      invoice({ id: '2', status: 'CANCELLED', currency: 'GBP', total: '100.00' }),
    ]);
    expect(Object.keys(result)).toEqual(['USD']);
  });
});

describe('the cards and the statement agree', () => {
  /**
   * The assertion that stops them drifting apart again.
   *
   * For a customer with no uninvoiced income, the outstanding card and the
   * statement's closing balance are the same number — computed by two entirely
   * separate code paths, from the same invoices, whatever mix of statuses those
   * invoices happen to be in.
   */
  const payments = [
    { id: 'p1', amount: '250.00', currency: 'USD', paymentDate: '2026-03-10', paymentMethod: 'cash', reference: null },
    { id: 'p2', amount: '100.00', currency: 'EUR', paymentDate: '2026-03-12', paymentMethod: 'cash', reference: null },
  ];

  const invoices: LedgerInvoice[] = [
    invoice({ id: '1', status: 'SENT', currency: 'USD', total: '1000.00', amountPaid: '250.00' }),
    invoice({ id: '2', status: 'DRAFT', currency: 'USD', total: '5841.00' }),
    invoice({ id: '3', status: 'PARTIALLY_PAID', currency: 'EUR', total: '600.00', amountPaid: '100.00' }),
    invoice({ id: '4', status: 'CANCELLED', currency: 'EUR', total: '24992.00' }),
    invoice({ id: '5', status: 'PAID', currency: 'USD', total: '0.00', amountPaid: '0.00' }),
  ];

  it('produces the same outstanding figure from both paths', () => {
    const card = cards(invoices);
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices, payments, income: [] }),
    });

    for (const currency of ['USD', 'EUR']) {
      expect(statement.byCurrency[currency].accountBalance, currency).toBe(
        card[currency].outstanding
      );
    }
  });

  it('reports no difference to explain', () => {
    const card = cards(invoices);
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices, payments, income: [] }),
    });

    for (const currency of ['USD', 'EUR']) {
      const reconciliation = reconcileStatement({
        outstanding: card[currency].outstanding,
        statementBalance: statement.byCurrency[currency].accountBalance,
        uninvoicedReceivables: '0.00',
      });
      expect(reconciliation.difference, currency).toBe('0.00');
      expect(reconciliation.reconciles, currency).toBe(true);
    }
  });

  it('agrees at zero for a customer holding only drafts', () => {
    const drafts = [invoice({ id: '1', status: 'DRAFT', total: '5841.00' })];
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices: drafts, payments: [], income: [] }),
    });
    const reconciliation = reconcileStatement({
      outstanding: cards(drafts).USD?.outstanding ?? '0.00',
      statementBalance: statement.byCurrency.USD.accountBalance,
      uninvoicedReceivables: '0.00',
    });
    expect(reconciliation.outstanding).toBe('0.00');
    expect(reconciliation.statementBalance).toBe('0.00');
    expect(reconciliation.reconciles).toBe(true);
  });
});

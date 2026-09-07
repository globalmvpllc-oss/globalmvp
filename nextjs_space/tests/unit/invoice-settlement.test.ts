import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  canTransition,
  deriveStatusFromPayments,
  isMoneyDerivedStatus,
  coversTotal,
  MONEY_DERIVED_STATUSES,
  ISSUED_INVOICE_STATUSES,
  INVOICE_STATUSES,
} from '@/lib/invoice-status';
import { computePaymentSummary } from '@/lib/payment-math';
import {
  customerMovements,
  outstandingByCurrency,
  reconcileStatement,
  type LedgerInvoice,
} from '@/lib/statement-sources';
import { buildStatement } from '@/lib/statement-ledger';

/**
 * An invoice cannot be paid without a payment.
 *
 * `PUT /api/invoices/[id]` used to grant `{ status: 'PAID' }` by writing the
 * field and nothing else, so an invoice read as settled while `amountPaid`
 * stayed at zero. Customer "Murat Sarıgül" had exactly that: one invoice,
 * status PAID, total 15,400.00, amountPaid 0.00 — settled on its own page and
 * still fully owed on the statement and the reports.
 *
 * The route now records the settling payment in the same transaction and
 * derives the status from the payment rows. These tests pin the arithmetic that
 * makes that safe, and the invariant it exists to keep:
 *
 *     an invoice is PAID only when amountPaid >= total
 */

/** The settling amount the route computes, from the payment rows. */
function settlement(total: string, payments: string[]) {
  return computePaymentSummary(
    total,
    payments.map((amount) => ({ amount }))
  );
}

/** What the route ends up storing: existing payments plus the settling one. */
function afterMarkPaid(total: string, payments: string[]) {
  const { remaining } = settlement(total, payments);
  const all = remaining.gt(0) ? [...payments, remaining.toFixed(2)] : payments;
  const amountPaid = all.reduce((sum, a) => sum.plus(new Decimal(a)), new Decimal(0));
  return { payments: all, amountPaid };
}

describe('the rule, stated', () => {
  it('names both statuses that money decides', () => {
    expect([...MONEY_DERIVED_STATUSES].sort()).toEqual(['PAID', 'PARTIALLY_PAID']);
    for (const status of MONEY_DERIVED_STATUSES) {
      expect(isMoneyDerivedStatus(status), status).toBe(true);
    }
  });

  it('leaves every other status freely settable', () => {
    const manual = INVOICE_STATUSES.filter((s) => !isMoneyDerivedStatus(s));
    expect([...manual].sort()).toEqual(['CANCELLED', 'DRAFT', 'OVERDUE', 'SENT', 'VIEWED']);
  });

  it('answers no for anything that is not a status', () => {
    for (const value of [null, undefined, '', 'paid', 'Paid', 7, {}]) {
      expect(isMoneyDerivedStatus(value)).toBe(false);
    }
  });

  it('holds that covering the total is what makes PAID honest', () => {
    expect(coversTotal('100.00', '100.00')).toBe(true);
    expect(coversTotal('100.00', '150.00')).toBe(true);
    expect(coversTotal('100.00', '99.99')).toBe(false);
    expect(coversTotal('15400.00', '0.00')).toBe(false);
    // A zero-total invoice is vacuously covered: there is nothing to collect.
    expect(coversTotal('0.00', '0.00')).toBe(true);
  });

  it('treats unusable amounts as not covering, never as covering', () => {
    // Absent is not zero: a missing total must never read as covered by a
    // payment of nothing, which is the very claim this refuses.
    for (const [total, paid] of [
      ['abc', '100'],
      ['100', 'abc'],
      [null, null],
      [null, '100'],
      [undefined, undefined],
      ['', ''],
    ] as const) {
      expect(coversTotal(total, paid), String(total) + '/' + String(paid)).toBe(false);
    }
    // A real zero total still counts as covered.
    expect(coversTotal(0, 0)).toBe(true);
  });
});

describe('an invoice cannot end up PAID with amountPaid below total', () => {
  it('is refused by the status derivation the route relies on', () => {
    // The derivation is what the route calls after recording the payment; it
    // cannot return PAID unless the money is there.
    expect(deriveStatusFromPayments('SENT', 0, 15400)).not.toBe('PAID');
    expect(deriveStatusFromPayments('SENT', 15399.99, 15400)).not.toBe('PAID');
    expect(deriveStatusFromPayments('SENT', 15400, 15400)).toBe('PAID');
  });

  it('settles for exactly the outstanding balance', () => {
    const { amountPaid } = afterMarkPaid('15400.00', []);
    expect(amountPaid.toFixed(2)).toBe('15400.00');
    expect(coversTotal('15400.00', amountPaid.toFixed(2))).toBe(true);
    expect(deriveStatusFromPayments('SENT', amountPaid.toNumber(), 15400)).toBe('PAID');
  });

  it('never records a payment that overshoots the total', () => {
    for (const already of [[], ['1.00'], ['7500.00'], ['15399.99']]) {
      const { amountPaid } = afterMarkPaid('15400.00', already);
      expect(amountPaid.toFixed(2), already.join('+')).toBe('15400.00');
    }
  });
});

describe('a partial payment followed by "mark paid" does not double-count', () => {
  it('records only the remainder', () => {
    const { remaining } = settlement('1000.00', ['250.00']);
    expect(remaining.toFixed(2)).toBe('750.00');

    const { payments, amountPaid } = afterMarkPaid('1000.00', ['250.00']);
    expect(payments).toEqual(['250.00', '750.00']);
    expect(amountPaid.toFixed(2)).toBe('1000.00');
  });

  it('records nothing at all when payments already cover the invoice', () => {
    // The status lagged behind the money; there is nothing left to collect.
    const { payments, amountPaid } = afterMarkPaid('1000.00', ['600.00', '400.00']);
    expect(payments).toHaveLength(2);
    expect(amountPaid.toFixed(2)).toBe('1000.00');
  });

  it('records nothing when the invoice was already overpaid', () => {
    const { remaining } = settlement('1000.00', ['1200.00']);
    // `computePaymentSummary` clamps at zero, so no negative payment is created.
    expect(remaining.toFixed(2)).toBe('0.00');
    const { payments } = afterMarkPaid('1000.00', ['1200.00']);
    expect(payments).toEqual(['1200.00']);
  });

  it('is idempotent — marking paid twice collects the money once', () => {
    const first = afterMarkPaid('1000.00', []);
    const second = afterMarkPaid('1000.00', first.payments);
    expect(second.payments).toEqual(first.payments);
    expect(second.amountPaid.toFixed(2)).toBe('1000.00');
  });

  it('does not drift over many small payments', () => {
    const many = Array.from({ length: 99 }, () => '0.10');
    const { amountPaid } = afterMarkPaid('100.00', many);
    expect(amountPaid.toFixed(2)).toBe('100.00');
  });
});

describe('terminal states stay terminal', () => {
  it('leaves CANCELLED alone', () => {
    expect(canTransition('CANCELLED', 'PAID')).toBe(false);
    expect(canTransition('CANCELLED', 'SENT')).toBe(false);
    // And the derivation refuses to move it even if money appears against it.
    expect(deriveStatusFromPayments('CANCELLED', 100, 100)).toBe('CANCELLED');
  });

  it('leaves PAID unable to move anywhere by hand', () => {
    for (const status of INVOICE_STATUSES) {
      expect(canTransition('PAID', status), status).toBe(false);
    }
  });

  it('still refuses to skip DRAFT straight to PAID', () => {
    // An unissued invoice cannot be settled; it has not been sent to anybody.
    expect(canTransition('DRAFT', 'PAID')).toBe(false);
    expect(deriveStatusFromPayments('DRAFT', 100, 100)).toBe('DRAFT');
  });

  it('keeps every transition the state machine already allowed', () => {
    // The route tightened *how* PAID is reached, not which states follow which.
    expect(canTransition('SENT', 'PAID')).toBe(true);
    expect(canTransition('PARTIALLY_PAID', 'PAID')).toBe(true);
    expect(canTransition('OVERDUE', 'PAID')).toBe(true);
    expect(canTransition('VIEWED', 'PAID')).toBe(true);
  });
});

describe('every surface agrees about the same invoice', () => {
  const payments = (amounts: string[]) =>
    amounts.map((amount, index) => ({
      id: `p${index}`,
      amount,
      currency: 'USD',
      paymentDate: '2026-03-10',
      paymentMethod: 'bank_transfer',
      reference: null,
    }));

  const invoiceRow = (status: string, amountPaid: string): LedgerInvoice => ({
    id: 'i1',
    invoiceNumber: 'INV-0001',
    status,
    currency: 'USD',
    total: '15400.00',
    amountPaid,
    issueDate: '2026-03-01',
  });

  /** The customer card, the statement and the invoice detail, side by side. */
  function surfaces(status: string, amountPaid: string, paid: string[]) {
    const invoice = invoiceRow(status, amountPaid);
    const card = outstandingByCurrency([invoice], 'USD');
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices: [invoice], payments: payments(paid), income: [] }),
    });
    const detail = new Decimal(String(invoice.total)).minus(new Decimal(amountPaid)).toFixed(2);
    return {
      card: card.USD ?? '0.00',
      statement: statement.byCurrency.USD.accountBalance,
      detail,
    };
  }

  it('agrees before settlement — fully owed on all three', () => {
    const before = surfaces('SENT', '0.00', []);
    expect(before).toEqual({ card: '15400.00', statement: '15400.00', detail: '15400.00' });
  });

  it('agrees after settlement — nothing owed on all three', () => {
    // What the route now produces: a payment for the full balance, and a status
    // derived from it.
    const after = surfaces('PAID', '15400.00', ['15400.00']);
    expect(after).toEqual({ card: '0.00', statement: '0.00', detail: '0.00' });

    const reconciliation = reconcileStatement({
      outstanding: after.card,
      statementBalance: after.statement,
      uninvoicedReceivables: '0.00',
    });
    expect(reconciliation.difference).toBe('0.00');
    expect(reconciliation.reconciles).toBe(true);
  });

  it('agrees mid-way through, after a partial payment', () => {
    const partway = surfaces('PARTIALLY_PAID', '5400.00', ['5400.00']);
    expect(partway).toEqual({ card: '10000.00', statement: '10000.00', detail: '10000.00' });
  });
});

describe('an invoice that is already inconsistent', () => {
  /**
   * The production row: PAID, total 15,400.00, amountPaid 0.00, no payments.
   *
   * This change stops new ones being created; it does not reach back and edit
   * the ones that exist. What these tests pin is how such a row reads until it
   * is corrected, and what correcting it does.
   */
  const broken: LedgerInvoice = {
    id: 'i1',
    invoiceNumber: 'INV-0001',
    status: 'PAID',
    currency: 'USD',
    total: '15400.00',
    amountPaid: '0.00',
    issueDate: '2026-03-01',
  };

  it('is still counted as owed by every money surface, which is the honest reading', () => {
    // The money is what it is: nothing was collected. Only the badge lies, and
    // the three figures agree with each other rather than with it.
    expect(outstandingByCurrency([broken], 'USD').USD).toBe('15400.00');

    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices: [broken], payments: [], income: [] }),
    });
    expect(statement.byCurrency.USD.accountBalance).toBe('15400.00');
  });

  it('is visible as a violation of the invariant', () => {
    expect(isMoneyDerivedStatus(broken.status)).toBe(true);
    expect(coversTotal(broken.total, broken.amountPaid)).toBe(false);
  });

  it('is told apart from a partially paid invoice, which is not a violation', () => {
    // `coversTotal` alone would call this one broken too: amountPaid is below
    // total, which for PARTIALLY_PAID is exactly right. The repair script asks
    // the complete question instead — does the derivation agree with what is
    // stored — so it leaves this alone.
    expect(coversTotal('1100.00', '400.00')).toBe(false);
    expect(deriveStatusFromPayments('PARTIALLY_PAID', 400, 1100)).toBe('PARTIALLY_PAID');
    // And it does not leave the genuinely broken one alone.
    expect(deriveStatusFromPayments('PAID', 0, 15400)).not.toBe('PAID');
  });

  it('is corrected by re-deriving its status from its payments', () => {
    // No payments exist, so it was never paid: it goes back to SENT, and the
    // badge stops contradicting the figures.
    expect(deriveStatusFromPayments('PAID', 0, 15400)).toBe('SENT');
  });

  it('stays on the statement either way, because an issued invoice is a debt', () => {
    for (const status of ['PAID', 'SENT']) {
      expect((ISSUED_INVOICE_STATUSES as readonly string[]).includes(status), status).toBe(true);
    }
  });
});

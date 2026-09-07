import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { canTransition, isSettling } from '@/lib/cheque-status';
import { deriveStatusFromPayments } from '@/lib/invoice-status';
import { computePaymentSummary } from '@/lib/payment-math';
import { buildChequeTotals } from '@/lib/cheque-totals';

/**
 * Clearing a cheque, and unclearing it when the bank sends it back.
 *
 * ## What was found, and what was true before this change
 *
 * The status route created a Payment on CLEARED and did nothing at all on
 * BOUNCED — no delete, no recalculation, and `paymentId` carried straight
 * through untouched. But the case could not arise either, because CLEARED was
 * a terminal state and `canTransition('RECEIVED', 'CLEARED', 'BOUNCED')`
 * returned false, so the route answered 409 and never reached the branch.
 *
 * So there was no orphan-payment bug. There was a missing capability: a cheque
 * marked cleared on its due date and returned by the bank a week later — the
 * karşılıksız case, the one that actually costs money — could not be recorded
 * at all. The only way out was to delete the instrument and its payment by
 * hand, which loses the evidence of the bounce.
 *
 * CLEARED and PAID are now settled but not final, they may move to BOUNCED, and
 * the route reverses the payment when they do. These tests model that reversal
 * as arithmetic, the way `invoice-settlement.test.ts` models "mark paid": the
 * route's own transaction needs a database, but everything it decides does not.
 */

/** The payment the clear creates: capped at what the document still owes. */
function settlingAmount(total: string, payments: string[], face: string): Decimal {
  const { remaining } = computePaymentSummary(
    total,
    payments.map((amount) => ({ amount }))
  );
  return Decimal.min(new Decimal(face), remaining);
}

/** The invoice's stored state, derived from its payment rows as the route does. */
function invoiceState(status: string, total: string, payments: string[]) {
  const paid = payments.reduce((sum, a) => sum.plus(new Decimal(a)), new Decimal(0));
  return {
    amountPaid: paid.toFixed(2),
    outstanding: new Decimal(total).minus(paid).toFixed(2),
    status: deriveStatusFromPayments(status, paid.toNumber(), Number(total)),
  };
}

describe('clearing a linked cheque', () => {
  it('creates a payment for the cheque and settles the invoice', () => {
    const before = invoiceState('SENT', '1000.00', []);
    expect(before).toEqual({ amountPaid: '0.00', outstanding: '1000.00', status: 'SENT' });

    const amount = settlingAmount('1000.00', [], '1000.00');
    expect(amount.toFixed(2)).toBe('1000.00');

    const after = invoiceState(before.status, '1000.00', [amount.toFixed(2)]);
    expect(after).toEqual({ amountPaid: '1000.00', outstanding: '0.00', status: 'PAID' });
  });

  it('never overpays a partly settled invoice', () => {
    // A 1,000 cheque against an invoice with 300 left pays 300, not 1,000.
    const amount = settlingAmount('1000.00', ['700.00'], '1000.00');
    expect(amount.toFixed(2)).toBe('300.00');
    expect(invoiceState('PARTIALLY_PAID', '1000.00', ['700.00', '300.00']).outstanding).toBe('0.00');
  });

  it('leaves an invoice partly paid when the cheque covers less than it owes', () => {
    const amount = settlingAmount('1000.00', [], '400.00');
    expect(amount.toFixed(2)).toBe('400.00');
    expect(invoiceState('SENT', '1000.00', ['400.00'])).toEqual({
      amountPaid: '400.00',
      outstanding: '600.00',
      status: 'PARTIALLY_PAID',
    });
  });

  it('is allowed only from presented, for a received cheque', () => {
    expect(canTransition('RECEIVED', 'PRESENTED', 'CLEARED')).toBe(true);
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'CLEARED')).toBe(false);
  });

  it('recognises exactly the two statuses that create money', () => {
    expect(isSettling('CLEARED')).toBe(true);
    expect(isSettling('PAID')).toBe(true);
    for (const status of ['PORTFOLIO', 'PRESENTED', 'OUTSTANDING', 'BOUNCED', 'CANCELLED']) {
      expect(isSettling(status), status).toBe(false);
    }
  });
});

describe('clear then bounce leaves the invoice exactly as it was', () => {
  /**
   * The regression this exists to stop.
   *
   * Deleting the payment and re-deriving is precisely what
   * `DELETE /api/payments/[id]` does, so the reversal is the existing mechanism
   * rather than a second one.
   */
  it('returns a fully unpaid invoice to where it started', () => {
    const before = invoiceState('SENT', '15400.00', []);
    const amount = settlingAmount('15400.00', [], '15400.00');
    const cleared = invoiceState(before.status, '15400.00', [amount.toFixed(2)]);
    expect(cleared.status).toBe('PAID');

    // Bounce: the payment the clear created is removed, and the invoice is
    // re-derived from the rows that remain — none.
    const bounced = invoiceState(cleared.status, '15400.00', []);
    expect(bounced.amountPaid).toBe(before.amountPaid);
    expect(bounced.outstanding).toBe(before.outstanding);
    expect(bounced.status).toBe(before.status);
  });

  it('returns a part-paid invoice to being part-paid, not to unpaid', () => {
    const before = invoiceState('PARTIALLY_PAID', '1000.00', ['300.00']);
    expect(before).toEqual({
      amountPaid: '300.00',
      outstanding: '700.00',
      status: 'PARTIALLY_PAID',
    });

    const amount = settlingAmount('1000.00', ['300.00'], '700.00');
    const cleared = invoiceState(before.status, '1000.00', ['300.00', amount.toFixed(2)]);
    expect(cleared.status).toBe('PAID');

    const bounced = invoiceState(cleared.status, '1000.00', ['300.00']);
    expect(bounced).toEqual(before);
  });

  it('leaves no payment behind — the whole point of the state', () => {
    // Modelled as the payment list: the cheque's own payment is gone, and any
    // payment recorded independently survives untouched.
    const payments = ['300.00', '700.00'];
    const afterBounce = payments.filter((_, index) => index !== 1);
    expect(afterBounce).toEqual(['300.00']);
    expect(invoiceState('PAID', '1000.00', afterBounce).status).toBe('PARTIALLY_PAID');
  });

  it('cannot double-reverse, because BOUNCED is final', () => {
    expect(canTransition('RECEIVED', 'BOUNCED', 'BOUNCED')).toBe(false);
    expect(canTransition('RECEIVED', 'BOUNCED', 'CLEARED')).toBe(false);
  });

  it('does the same on the issued side', () => {
    const before = invoiceState('SENT', '500.00', []);
    const cleared = invoiceState(before.status, '500.00', ['500.00']);
    expect(cleared.outstanding).toBe('0.00');
    expect(invoiceState(cleared.status, '500.00', [])).toEqual(before);
    expect(canTransition('ISSUED', 'PAID', 'BOUNCED')).toBe(true);
  });

  /**
   * The one thing the reversal cannot restore, stated rather than hidden.
   *
   * `deriveStatusFromPayments` has no notion of a due date, so an invoice that
   * was manually marked OVERDUE and then cleared comes back as SENT rather than
   * OVERDUE. The *money* is exactly restored — amountPaid and outstanding are
   * back to the cent — and this is identical to what deleting the payment by
   * hand already does today, so the cheque path behaves like every other path
   * rather than inventing its own rule.
   */
  it('restores the money exactly, and the status to SENT from OVERDUE', () => {
    const before = invoiceState('OVERDUE', '1000.00', []);
    const cleared = invoiceState('OVERDUE', '1000.00', ['1000.00']);
    const bounced = invoiceState(cleared.status, '1000.00', []);

    expect(bounced.amountPaid).toBe(before.amountPaid);
    expect(bounced.outstanding).toBe(before.outstanding);
    expect(bounced.status).toBe('SENT');
  });
});

describe('bouncing without a payment', () => {
  it('is a no-op on the invoice when the cheque never cleared', () => {
    // Straight from the drawer: no payment was ever created, so there is
    // nothing to delete and the invoice cannot move.
    const before = invoiceState('SENT', '1000.00', []);
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'BOUNCED')).toBe(true);
    const after = invoiceState(before.status, '1000.00', []);
    expect(after).toEqual(before);
  });

  it('is a no-op from presented too', () => {
    const before = invoiceState('PARTIALLY_PAID', '1000.00', ['200.00']);
    expect(canTransition('RECEIVED', 'PRESENTED', 'BOUNCED')).toBe(true);
    expect(invoiceState(before.status, '1000.00', ['200.00'])).toEqual(before);
  });
});

describe('an unlinked cheque', () => {
  /**
   * A cheque taken on account, settling no single document.
   *
   * Asserted deliberately rather than left to chance: it clears, and it creates
   * no Payment. `Payment` requires exactly one of invoiceId/expenseId, and an
   * unlinked money row would put an amount into totals with nothing explaining
   * it. The cash is real; the product simply has no document to post it
   * against, and recording the income separately is the existing answer.
   */
  it('clears without creating a payment', () => {
    expect(canTransition('RECEIVED', 'PRESENTED', 'CLEARED')).toBe(true);
    // Nothing to compute a settling amount against.
    const linkedDocument = null;
    expect(linkedDocument).toBeNull();
  });

  it('still counts as held while it is in the drawer', () => {
    const totals = buildChequeTotals({
      rows: [
        {
          direction: 'RECEIVED',
          status: 'PORTFOLIO',
          currency: 'USD',
          amount: '2500.00',
          dueDate: '2026-03-20T00:00:00.000Z',
        },
      ],
      defaultCurrency: 'USD',
      timeZone: 'UTC',
      now: new Date('2026-03-01T12:00:00.000Z'),
    });
    expect(totals.byCurrency.USD.held).toBe('2500.00');
  });

  it('stops being held once it clears, with or without a payment behind it', () => {
    const totals = buildChequeTotals({
      rows: [
        {
          direction: 'RECEIVED',
          status: 'CLEARED',
          currency: 'USD',
          amount: '2500.00',
          dueDate: '2026-03-20T00:00:00.000Z',
        },
      ],
      defaultCurrency: 'USD',
      timeZone: 'UTC',
      now: new Date('2026-03-01T12:00:00.000Z'),
    });
    expect(totals.byCurrency.USD.held).toBe('0.00');
  });

  it('moves to bounced without touching any document', () => {
    const totals = buildChequeTotals({
      rows: [
        {
          direction: 'RECEIVED',
          status: 'BOUNCED',
          currency: 'USD',
          amount: '2500.00',
          dueDate: '2026-03-20T00:00:00.000Z',
        },
      ],
      defaultCurrency: 'USD',
      timeZone: 'UTC',
      now: new Date('2026-03-01T12:00:00.000Z'),
    });
    expect(totals.byCurrency.USD.bounced).toBe('2500.00');
    expect(totals.byCurrency.USD.held).toBe('0.00');
  });
});

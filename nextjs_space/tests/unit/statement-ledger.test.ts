import { describe, it, expect } from 'vitest';
import {
  buildStatement,
  STATEMENT_MAX_ROWS,
  type StatementMovement,
} from '@/lib/statement-ledger';
import {
  customerMovements,
  vendorMovements,
  outstandingByCurrency,
  reconcileStatement,
  isStatementInvoice,
  STATEMENT_INVOICE_STATUSES,
  EXCLUDED_INVOICE_STATUSES,
  type LedgerInvoice,
} from '@/lib/statement-sources';
import { generateStatementHtml } from '@/lib/statement-html';
import { INVOICE_STATUSES } from '@/lib/invoice-status';

/**
 * The account statement, tested as pure arithmetic.
 *
 * No database anywhere in this file: the ledger is a function from movements to
 * rows and balances, which is exactly why it lives in lib/ rather than inside a
 * route. A statement that is wrong is worse than no statement, so the awkward
 * cases — an opening balance, a same-day pair, an overpayment, two currencies —
 * are pinned here rather than checked by eye against real data once.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function movement(over: Partial<StatementMovement> & { id: string }): StatementMovement {
  return {
    kind: 'invoice',
    date: '2026-03-01',
    currency: 'USD',
    reference: 'ref',
    ...over,
  };
}

describe('buildStatement — ordering and running balance', () => {
  it('orders rows by date and accumulates the balance after each one', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'c', kind: 'invoice', date: '2026-03-22', debit: '1200.00', reference: 'INV-0051' }),
        movement({ id: 'b', kind: 'payment', date: '2026-03-15', credit: '2000.00', reference: 'cash' }),
        movement({ id: 'a', kind: 'invoice', date: '2026-03-01', debit: '5000.00', reference: 'INV-0042' }),
      ],
    });

    const rows = payload.byCurrency.USD.rows;
    expect(rows.map((r) => r.reference)).toEqual(['INV-0042', 'cash', 'INV-0051']);
    expect(rows.map((r) => r.balance)).toEqual(['5000.00', '3000.00', '4200.00']);
    expect(payload.byCurrency.USD.closing).toBe('4200.00');
    expect(payload.byCurrency.USD.accountBalance).toBe('4200.00');
    expect(payload.byCurrency.USD.debitTotal).toBe('6200.00');
    expect(payload.byCurrency.USD.creditTotal).toBe('2000.00');
  });

  it('puts the debit before the credit when both fall on the same date', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'pay', kind: 'payment', date: '2026-03-01', credit: '5000.00' }),
        movement({ id: 'inv', kind: 'invoice', date: '2026-03-01', debit: '5000.00' }),
      ],
    });

    const rows = payload.byCurrency.USD.rows;
    expect(rows.map((r) => r.kind)).toEqual(['invoice', 'payment']);
    // Never a negative balance in between for an invoice settled the day it was
    // raised.
    expect(rows.map((r) => r.balance)).toEqual(['5000.00', '0.00']);
  });

  it('is deterministic for two movements of the same kind on the same date', () => {
    const build = (movements: StatementMovement[]) =>
      buildStatement({ defaultCurrency: 'USD', movements }).byCurrency.USD.rows.map((r) => r.id);

    const a = movement({ id: 'invoice:aaa', debit: '10.00' });
    const b = movement({ id: 'invoice:bbb', debit: '20.00' });

    expect(build([a, b])).toEqual(['invoice:aaa', 'invoice:bbb']);
    expect(build([b, a])).toEqual(['invoice:aaa', 'invoice:bbb']);
  });

  it('places same-day movements identically however the input is shuffled', () => {
    const movements = [
      movement({ id: 'p2', kind: 'payment', date: '2026-04-02', credit: '5.00' }),
      movement({ id: 'i1', kind: 'invoice', date: '2026-04-02', debit: '30.00' }),
      movement({ id: 'n1', kind: 'income', date: '2026-04-02', debit: '7.00' }),
      movement({ id: 'p1', kind: 'payment', date: '2026-04-02', credit: '2.00' }),
    ];
    const forwards = buildStatement({ defaultCurrency: 'USD', movements }).byCurrency.USD;
    const backwards = buildStatement({
      defaultCurrency: 'USD',
      movements: [...movements].reverse(),
    }).byCurrency.USD;

    expect(forwards.rows.map((r) => r.id)).toEqual(backwards.rows.map((r) => r.id));
    expect(forwards.rows.map((r) => r.balance)).toEqual(backwards.rows.map((r) => r.balance));
    expect(forwards.closing).toBe('30.00');
  });
});

describe('buildStatement — opening balance and the date window', () => {
  const movements = [
    movement({ id: 'a', kind: 'invoice', date: '2026-01-10', debit: '1000.00' }),
    movement({ id: 'b', kind: 'payment', date: '2026-01-20', credit: '400.00' }),
    movement({ id: 'c', kind: 'invoice', date: '2026-02-05', debit: '250.00' }),
    movement({ id: 'd', kind: 'payment', date: '2026-03-09', credit: '100.00' }),
  ];

  it('carries the balance from before the window instead of restarting at zero', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements,
      window: { gte: day('2026-02-01') },
    });

    const usd = payload.byCurrency.USD;
    expect(usd.opening).toBe('600.00');
    expect(usd.rows.map((r) => r.id)).toEqual(['c', 'd']);
    // The first row inside the window continues from the opening balance.
    expect(usd.rows.map((r) => r.balance)).toEqual(['850.00', '750.00']);
    expect(usd.closing).toBe('750.00');
  });

  it('treats the upper bound as exclusive and still counts what lies beyond it', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements,
      window: { gte: day('2026-01-01'), lt: day('2026-02-05') },
    });

    const usd = payload.byCurrency.USD;
    // 5 February is excluded by a `to` of 5 February: the window is half-open.
    expect(usd.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(usd.closing).toBe('600.00');
    // The account balance is still the whole account, not the window.
    expect(usd.accountBalance).toBe('750.00');
  });

  it('reports the carried balance as the closing figure for an empty window', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements,
      window: { gte: day('2026-05-01'), lt: day('2026-06-01') },
    });

    const usd = payload.byCurrency.USD;
    expect(usd.rows).toEqual([]);
    expect(usd.opening).toBe('750.00');
    // Not zero: an empty month on an account that owes 750 still owes 750.
    expect(usd.closing).toBe('750.00');
    expect(payload.hasMovements).toBe(true);
  });

  it('opens at zero when the window starts before the account did', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements,
      window: { gte: day('2025-01-01') },
    });
    expect(payload.byCurrency.USD.opening).toBe('0.00');
    expect(payload.byCurrency.USD.rows).toHaveLength(4);
  });
});

describe('buildStatement — currency', () => {
  it('keeps currencies apart and never sums across them', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'u1', currency: 'USD', debit: '1000.00' }),
        movement({ id: 'e1', currency: 'EUR', debit: '500.00' }),
        movement({ id: 'e2', currency: 'EUR', kind: 'payment', date: '2026-03-05', credit: '200.00' }),
      ],
    });

    expect(payload.currencies).toEqual(['EUR', 'USD']);
    expect(payload.byCurrency.USD.accountBalance).toBe('1000.00');
    expect(payload.byCurrency.EUR.accountBalance).toBe('300.00');
    // 1000 USD and 500 EUR is never 1500 of anything.
    expect(Object.values(payload.byCurrency).map((c) => c.accountBalance)).not.toContain('1300.00');
  });

  it('attributes a movement with no currency to the account default', () => {
    const payload = buildStatement({
      defaultCurrency: 'TRY',
      movements: [movement({ id: 'x', currency: null, debit: '10.00' })],
    });
    expect(payload.currencies).toEqual(['TRY']);
    expect(payload.byCurrency.TRY.accountBalance).toBe('10.00');
  });

  it('sorts currencies so the render order is stable between requests', () => {
    const build = (order: string[]) =>
      buildStatement({
        defaultCurrency: 'USD',
        movements: order.map((currency, index) =>
          movement({ id: `m${index}`, currency, debit: '1.00' })
        ),
      }).currencies;

    expect(build(['USD', 'EUR', 'GBP'])).toEqual(['EUR', 'GBP', 'USD']);
    expect(build(['GBP', 'USD', 'EUR'])).toEqual(['EUR', 'GBP', 'USD']);
  });
});

describe('buildStatement — precision', () => {
  it('accepts Decimal-as-string amounts without producing NaN', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'a', debit: '1234.56' }),
        movement({ id: 'b', kind: 'payment', date: '2026-03-02', credit: '34.56' }),
      ],
    });

    for (const row of payload.byCurrency.USD.rows) {
      expect(row.balance).not.toContain('NaN');
      expect(Number.isNaN(Number(row.balance))).toBe(false);
    }
    expect(payload.byCurrency.USD.accountBalance).toBe('1200.00');
  });

  it('does not drift over many rows the way floating point would', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; 3000 x 0.10 must still be 300.
    const movements = Array.from({ length: 3000 }, (_, index) =>
      movement({ id: `m${String(index).padStart(4, '0')}`, debit: '0.10' })
    );
    const payload = buildStatement({ defaultCurrency: 'USD', movements });
    expect(payload.byCurrency.USD.accountBalance).toBe('300.00');
    expect(payload.byCurrency.USD.rows.at(-1)?.balance).toBe('300.00');
  });

  it('treats an unusable amount as zero rather than poisoning the balance', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'a', debit: '100.00' }),
        movement({ id: 'b', date: '2026-03-02', debit: 'not-a-number' }),
        movement({ id: 'c', date: '2026-03-03', debit: Number.NaN as unknown as string }),
      ],
    });
    expect(payload.byCurrency.USD.accountBalance).toBe('100.00');
  });

  it('emits every figure as a fixed 2dp string', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [movement({ id: 'a', debit: '7' })],
    });
    const usd = payload.byCurrency.USD;
    for (const value of [usd.opening, usd.closing, usd.accountBalance, usd.debitTotal, usd.creditTotal]) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(usd.rows[0].debit).toBe('7.00');
    expect(usd.rows[0].credit).toBe('0.00');
  });
});

describe('buildStatement — accounts with nothing on them', () => {
  it('yields an empty statement with a zero balance, never undefined', () => {
    const payload = buildStatement({ defaultCurrency: 'EUR', movements: [] });

    expect(payload.hasMovements).toBe(false);
    expect(payload.currencies).toEqual(['EUR']);
    const eur = payload.byCurrency.EUR;
    expect(eur).toBeDefined();
    expect(eur.rows).toEqual([]);
    expect(eur.opening).toBe('0.00');
    expect(eur.closing).toBe('0.00');
    expect(eur.accountBalance).toBe('0.00');
    expect(eur.movementCount).toBe(0);
  });

  it('separates "never moved" from "nothing in this window"', () => {
    const never = buildStatement({ defaultCurrency: 'USD', movements: [] });
    const quiet = buildStatement({
      defaultCurrency: 'USD',
      movements: [movement({ id: 'a', debit: '5.00' })],
      window: { gte: day('2030-01-01') },
    });

    expect(never.hasMovements).toBe(false);
    expect(quiet.hasMovements).toBe(true);
    expect(quiet.byCurrency.USD.rows).toEqual([]);
  });
});

describe('buildStatement — overpayment', () => {
  it('lets the balance go negative rather than clamping an advance to zero', () => {
    const payload = buildStatement({
      defaultCurrency: 'USD',
      movements: [
        movement({ id: 'a', kind: 'invoice', date: '2026-03-01', debit: '1000.00' }),
        movement({ id: 'b', kind: 'payment', date: '2026-03-10', credit: '1500.00' }),
      ],
    });

    const usd = payload.byCurrency.USD;
    expect(usd.rows.map((r) => r.balance)).toEqual(['1000.00', '-500.00']);
    expect(usd.accountBalance).toBe('-500.00');
    // Clamping would report a settled account while 500 sits on it.
    expect(usd.accountBalance).not.toBe('0.00');
  });
});

describe('customerMovements — what counts as a movement', () => {
  const invoice = (over: Partial<LedgerInvoice> & { id: string }): LedgerInvoice => ({
    invoiceNumber: `INV-${over.id}`,
    status: 'SENT',
    currency: 'USD',
    total: '100.00',
    amountPaid: '0.00',
    issueDate: '2026-03-01',
    ...over,
  });

  it('covers every invoice status exactly once, on the ledger or off it', () => {
    const covered = [...STATEMENT_INVOICE_STATUSES, ...EXCLUDED_INVOICE_STATUSES].sort();
    expect(covered).toEqual([...INVOICE_STATUSES].sort());
  });

  it('keeps DRAFT and CANCELLED invoices off the statement', () => {
    for (const status of EXCLUDED_INVOICE_STATUSES) {
      expect(isStatementInvoice(status)).toBe(false);
    }
    const movements = customerMovements({
      invoices: [
        invoice({ id: '1', status: 'DRAFT' }),
        invoice({ id: '2', status: 'CANCELLED' }),
        invoice({ id: '3', status: 'SENT' }),
      ],
      payments: [],
      income: [],
    });
    expect(movements.map((m) => m.reference)).toEqual(['INV-3']);
  });

  it('includes every issued status', () => {
    const movements = customerMovements({
      invoices: STATEMENT_INVOICE_STATUSES.map((status, index) =>
        invoice({ id: String(index), status })
      ),
      payments: [],
      income: [],
    });
    expect(movements).toHaveLength(STATEMENT_INVOICE_STATUSES.length);
    expect(movements.every((m) => m.kind === 'invoice')).toBe(true);
  });

  it('counts EXPECTED income as a receivable and leaves RECEIVED income off', () => {
    const movements = customerMovements({
      invoices: [],
      payments: [],
      income: [
        { id: 'i1', description: 'Retainer', status: 'EXPECTED', currency: 'USD', amount: '300.00', date: '2026-03-04' },
        { id: 'i2', description: 'Cash sale', status: 'RECEIVED', currency: 'USD', amount: '900.00', date: '2026-03-05' },
      ],
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].kind).toBe('income');
    expect(movements[0].debit?.toString()).toBe('300');
    // RECEIVED income has no matching debit to clear; posting it as a credit
    // would turn a completed cash sale into a customer advance.
    expect(movements.some((m) => m.credit)).toBe(false);
  });

  it('records a payment as a credit on its payment date', () => {
    const movements = customerMovements({
      invoices: [],
      payments: [
        {
          id: 'p1',
          amount: '250.00',
          currency: 'USD',
          paymentDate: '2026-03-15',
          paymentMethod: 'bank_transfer',
          reference: 'TR-9',
          documentLabel: 'INV-0042',
        },
      ],
      income: [],
    });

    expect(movements[0]).toMatchObject({
      kind: 'payment',
      reference: 'bank_transfer',
      description: 'INV-0042',
    });
    expect(movements[0].credit?.toString()).toBe('250');
    expect(movements[0].debit).toBeUndefined();
  });
});

describe('customer statement reconciles with the customer page', () => {
  const invoices: LedgerInvoice[] = [
    { id: 'a', invoiceNumber: 'INV-1', status: 'SENT', currency: 'USD', total: '5000.00', amountPaid: '2000.00', issueDate: '2026-03-01' },
    { id: 'b', invoiceNumber: 'INV-2', status: 'PARTIALLY_PAID', currency: 'USD', total: '1200.00', amountPaid: '200.00', issueDate: '2026-03-22' },
    { id: 'c', invoiceNumber: 'INV-3', status: 'PAID', currency: 'EUR', total: '900.00', amountPaid: '900.00', issueDate: '2026-04-02' },
  ];

  /** The payments that produced each invoice's amountPaid. */
  const payments = [
    { id: 'p1', amount: '2000.00', currency: 'USD', paymentDate: '2026-03-15', paymentMethod: 'bank_transfer', reference: null },
    { id: 'p2', amount: '200.00', currency: 'USD', paymentDate: '2026-03-25', paymentMethod: 'cash', reference: null },
    { id: 'p3', amount: '900.00', currency: 'EUR', paymentDate: '2026-04-02', paymentMethod: 'card', reference: null },
  ];

  it('closes at exactly the outstanding figure the detail page already shows', () => {
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({ invoices, payments, income: [] }),
    });
    const outstanding = outstandingByCurrency(invoices, 'USD');

    expect(statement.byCurrency.USD.accountBalance).toBe(outstanding.USD);
    expect(statement.byCurrency.EUR.accountBalance).toBe(outstanding.EUR);
    expect(outstanding).toEqual({ USD: '4000.00', EUR: '0.00' });
  });

  it('explains the gap when drafts and uninvoiced income are in play', () => {
    const withExtras: LedgerInvoice[] = [
      ...invoices,
      { id: 'd', invoiceNumber: 'INV-4', status: 'DRAFT', currency: 'USD', total: '700.00', amountPaid: '0.00', issueDate: '2026-05-01' },
    ];
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: customerMovements({
        invoices: withExtras,
        payments,
        income: [
          { id: 'i1', description: 'Retainer', status: 'EXPECTED', currency: 'USD', amount: '150.00', date: '2026-05-02' },
        ],
      }),
    });

    const outstanding = outstandingByCurrency(withExtras, 'USD');
    expect(outstanding.USD).toBe('4700.00');

    const reconciliation = reconcileStatement({
      outstanding: outstanding.USD,
      statementBalance: statement.byCurrency.USD.accountBalance,
      excludedInvoices: '700.00',
      uninvoicedReceivables: '150.00',
    });

    expect(reconciliation.statementBalance).toBe('4150.00');
    expect(reconciliation.difference).toBe('-550.00');
    expect(reconciliation.reconciles).toBe(true);
  });

  it('flags a difference that drafts and uninvoiced income do not explain', () => {
    const reconciliation = reconcileStatement({
      outstanding: '1000.00',
      statementBalance: '400.00',
      excludedInvoices: '0.00',
      uninvoicedReceivables: '0.00',
    });
    expect(reconciliation.reconciles).toBe(false);
    expect(reconciliation.difference).toBe('-600.00');
  });

  it('reconciles trivially for an account with nothing on it', () => {
    const reconciliation = reconcileStatement({
      outstanding: null,
      statementBalance: null,
      excludedInvoices: null,
      uninvoicedReceivables: null,
    });
    expect(reconciliation).toMatchObject({
      outstanding: '0.00',
      statementBalance: '0.00',
      difference: '0.00',
      reconciles: true,
    });
  });

  it('groups outstanding per currency and never sums across them', () => {
    expect(
      outstandingByCurrency([
        { currency: 'USD', total: '100.00', amountPaid: '0.00' },
        { currency: 'EUR', total: '100.00', amountPaid: '0.00' },
      ])
    ).toEqual({ USD: '100.00', EUR: '100.00' });
  });
});

describe('vendorMovements — what you owe', () => {
  const expense = (over: Partial<Parameters<typeof vendorMovements>[0]['expenses'][number]> & { id: string }) => ({
    description: `Expense ${over.id}`,
    category: 'Software',
    status: 'UNPAID',
    currency: 'USD',
    amount: '100.00',
    date: '2026-03-01',
    ...over,
  });

  it('debits every expense whatever its status, due date or none', () => {
    const movements = vendorMovements({
      expenses: [expense({ id: '1' }), expense({ id: '2', status: 'UNPAID' })],
      payments: [],
    });
    expect(movements.filter((m) => m.kind === 'expense')).toHaveLength(2);
    const statement = buildStatement({ defaultCurrency: 'USD', movements });
    expect(statement.byCurrency.USD.accountBalance).toBe('200.00');
  });

  it('clears an expense marked PAID that carries no payment of its own', () => {
    // The expense form lets a user set PAID directly. Without this the first
    // vendor statement would show a payable the business does not owe.
    const movements = vendorMovements({
      expenses: [expense({ id: '1', status: 'PAID' })],
      payments: [],
    });

    expect(movements.map((m) => m.kind)).toEqual(['expense', 'settlement']);
    const statement = buildStatement({ defaultCurrency: 'USD', movements });
    expect(statement.byCurrency.USD.accountBalance).toBe('0.00');
    // The debit is still visible; it is cleared, not hidden.
    expect(statement.byCurrency.USD.rows).toHaveLength(2);
  });

  it('does not double-count an expense that has a real payment recorded', () => {
    const movements = vendorMovements({
      expenses: [expense({ id: '1', status: 'PAID' })],
      payments: [
        { id: 'p1', expenseId: '1', amount: '100.00', currency: 'USD', paymentDate: '2026-03-05', paymentMethod: 'cash', reference: null },
      ],
    });

    expect(movements.some((m) => m.kind === 'settlement')).toBe(false);
    const statement = buildStatement({ defaultCurrency: 'USD', movements });
    expect(statement.byCurrency.USD.accountBalance).toBe('0.00');
  });

  it('settles only the shortfall on a part-paid expense later marked PAID', () => {
    const movements = vendorMovements({
      expenses: [expense({ id: '1', status: 'PAID', amount: '100.00' })],
      payments: [
        { id: 'p1', expenseId: '1', amount: '30.00', currency: 'USD', paymentDate: '2026-03-05', paymentMethod: 'cash', reference: null },
      ],
    });

    const settlement = movements.find((m) => m.kind === 'settlement');
    expect(settlement?.credit?.toString()).toBe('70');
    const statement = buildStatement({ defaultCurrency: 'USD', movements });
    expect(statement.byCurrency.USD.accountBalance).toBe('0.00');
  });

  it('never invents a credit larger than the expense', () => {
    const movements = vendorMovements({
      expenses: [expense({ id: '1', status: 'PAID', amount: '100.00' })],
      payments: [
        { id: 'p1', expenseId: '1', amount: '250.00', currency: 'USD', paymentDate: '2026-03-05', paymentMethod: 'cash', reference: null },
      ],
    });

    expect(movements.some((m) => m.kind === 'settlement')).toBe(false);
    // An overpaid expense leaves the vendor owing you, which is a real state.
    const statement = buildStatement({ defaultCurrency: 'USD', movements });
    expect(statement.byCurrency.USD.accountBalance).toBe('-150.00');
  });

  it('reads as a payable ledger end to end', () => {
    const statement = buildStatement({
      defaultCurrency: 'USD',
      movements: vendorMovements({
        expenses: [
          expense({ id: '1', amount: '400.00', date: '2026-03-01' }),
          expense({ id: '2', amount: '150.00', date: '2026-03-20' }),
        ],
        payments: [
          { id: 'p1', expenseId: '1', amount: '400.00', currency: 'USD', paymentDate: '2026-03-10', paymentMethod: 'bank_transfer', reference: null },
        ],
      }),
    });

    expect(statement.byCurrency.USD.rows.map((r) => r.balance)).toEqual([
      '400.00',
      '0.00',
      '150.00',
    ]);
  });
});

describe('generateStatementHtml', () => {
  const labels = {
    title: 'Account statement',
    statementFor: 'Statement for',
    issued: 'Issued',
    period: 'Period',
    allTime: 'All time',
    date: 'Date',
    type: 'Type',
    reference: 'Reference',
    debit: 'Debit',
    credit: 'Credit',
    balance: 'Balance',
    opening: 'Opening balance',
    closing: 'Closing balance',
    periodDebit: 'Charged',
    periodCredit: 'Settled',
    empty: 'No movements in this period',
    kind: {
      invoice: 'Invoice',
      expense: 'Expense',
      income: 'Uninvoiced',
      payment: 'Payment',
      settlement: 'Marked paid',
    },
  };

  const section = buildStatement({
    defaultCurrency: 'USD',
    movements: [
      movement({ id: 'a', debit: '100.00', reference: '<script>alert(1)</script>' }),
    ],
  }).byCurrency.USD;

  const render = (over: Record<string, unknown> = {}) =>
    generateStatementHtml({
      party: { name: 'Acme & Co', email: 'a@example.com' },
      company: { name: 'My Business', primaryColor: '#123456' },
      sections: [section],
      labels,
      formatAmount: (amount, currency) => `${currency} ${amount}`,
      issuedOn: new Date('2026-06-01T00:00:00.000Z'),
      ...over,
    } as Parameters<typeof generateStatementHtml>[0]);

  it('escapes party and row text so a statement cannot inject markup', () => {
    const html = render();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Acme &amp; Co');
  });

  it('rejects a brand colour that is not a literal hex value', () => {
    const html = render({ company: { name: 'X', primaryColor: 'red; } body { display:none' } });
    expect(html).not.toContain('display:none');
    expect(html).toContain('#7C3AED');
  });

  it('names the period, with the half-open upper bound shown as its last day', () => {
    const html = render({ range: { from: '2026-03-01', to: '2026-04-01' } });
    expect(html).toContain('March 1, 2026');
    // `to` is exclusive, so the statement covers up to 31 March, not 1 April.
    expect(html).toContain('March 31, 2026');
    expect(html).not.toContain('April 1, 2026');
  });

  it('says "all time" when no window was applied', () => {
    expect(render()).toContain('All time');
  });
});

describe('STATEMENT_MAX_ROWS', () => {
  it('sits far above what one small-business account accumulates', () => {
    expect(STATEMENT_MAX_ROWS).toBeGreaterThanOrEqual(1000);
  });
});

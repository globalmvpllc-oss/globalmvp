import Decimal from 'decimal.js';
import type { DecimalLike } from '@/lib/payment-math';
import type { StatementMovement } from '@/lib/statement-ledger';
import { isIssuedInvoice } from '@/lib/invoice-status';

/**
 * What counts as a movement on an account statement.
 *
 * Pure policy plus mapping, no database access, so the decisions below can be
 * tested rather than only argued about. The routes select rows and hand them
 * here; nothing here knows about Prisma.
 *
 * ## Which invoices belong on a customer statement
 *
 * SENT, VIEWED, PARTIALLY_PAID, PAID and OVERDUE. Not DRAFT, not CANCELLED.
 *
 * A DRAFT invoice has not been issued to anybody. Putting it on a statement
 * would tell a customer they owe money for a document they have never seen —
 * and this statement is a document you hand to that customer. A CANCELLED
 * invoice is not a debt either: cancelling it is precisely the act of saying so.
 *
 * The customer detail cards above the statement now apply the same filter —
 * they used to sum every status, which is what reported four unissued drafts as
 * a five-figure receivable. The two therefore agree on invoices, and what is
 * left for `reconcileStatement` to explain is only the uninvoiced income the
 * ledger carries and the cards do not.
 *
 * ## Which income belongs
 *
 * EXPECTED only, as a debit. An EXPECTED income row attached to a customer is
 * money that customer owes which was never invoiced — a receivable, and this
 * ledger is a receivables ledger, so it belongs.
 *
 * RECEIVED income is deliberately left off entirely. It is money already
 * collected outside the invoice/payment flow, and it settles nothing on this
 * ledger: there is no matching debit for it to clear, so posting it as a credit
 * would drive the balance negative and misrepresent a completed cash sale as a
 * customer advance. When an EXPECTED row is later marked RECEIVED it simply
 * leaves the ledger, which is the right outcome — the receivable is gone
 * because it was collected.
 *
 * /api/reports counts income RECEIVED because a report is about what happened;
 * a statement is about what is owed. The two questions have different answers
 * and both are correct.
 *
 * ## Which expenses belong on a vendor statement
 *
 * All of them, at every status, as debits dated on the day they were recorded.
 * An expense is a payable from the moment it exists: a due date says *when* it
 * must be settled, not *whether* it is owed, so an expense with no due date is
 * every bit as much a payable as one with a due date next week.
 *
 * The credit side is the payments recorded against those expenses — plus one
 * synthetic row, explained at `vendorMovements`.
 */

/**
 * Which invoices reach the ledger.
 *
 * Re-exported from `lib/invoice-status.ts` rather than restated here. This file
 * used to own the list, and while the customer cards and the reports totals
 * carried their own (unfiltered) idea of the same thing, the two disagreed by
 * the value of every draft. One definition, three readers.
 */
export {
  ISSUED_INVOICE_STATUSES,
  UNISSUED_INVOICE_STATUSES,
  isIssuedInvoice,
} from '@/lib/invoice-status';

/** Income status treated as an uninvoiced receivable. */
export const STATEMENT_INCOME_STATUS = 'EXPECTED';

export interface LedgerInvoice {
  id: string;
  invoiceNumber: string | null;
  status: string | null;
  currency: string | null;
  total: DecimalLike | null;
  amountPaid: DecimalLike | null;
  issueDate: Date | string;
}

export interface LedgerPayment {
  id: string;
  amount: DecimalLike | null;
  currency: string | null;
  paymentDate: Date | string;
  paymentMethod: string | null;
  reference: string | null;
  /** Invoice number or expense description, for the row's second line. */
  documentLabel?: string | null;
  /** Set on the vendor side so a settlement can tell what is already covered. */
  expenseId?: string | null;
}

export interface LedgerIncome {
  id: string;
  description: string | null;
  status: string | null;
  currency: string | null;
  amount: DecimalLike | null;
  date: Date | string;
}

export interface LedgerExpense {
  id: string;
  description: string | null;
  category: string | null;
  status: string | null;
  currency: string | null;
  amount: DecimalLike | null;
  date: Date | string;
}

/** Coerces anything Decimal-shaped to a Decimal, treating unusable input as 0. */
function dec(value: DecimalLike | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  try {
    const parsed = new Decimal(value.toString());
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * Movements on a customer account: what they owe you.
 *
 * Invoices debit on their issue date — the day the debt was raised, which is
 * also the date /api/reports filters invoices on. Payments credit on their
 * payment date. Uninvoiced EXPECTED income debits on the day it was recorded.
 *
 * ## Cheques and promissory notes
 *
 * A ChequeInstrument never appears on a statement in its own right, and that is
 * deliberate rather than an omission. In the portfolio it is a promise: the
 * invoice it relates to is exactly as outstanding as it was, and drawing it as
 * a credit would say the customer had paid when they had not.
 *
 * When it clears, the cheque route creates an ordinary `Payment` and the
 * statement picks it up through the payment query like any other — same credit,
 * same date, same effect on the balance. So no term here changes, the
 * reconciliation needs nothing new, and a cheque moves exactly the figures a
 * manually recorded payment of the same amount would move.
 *
 * ## Why there is no settlement row here, unlike the vendor side
 *
 * `vendorMovements` below invents a credit for an expense marked PAID that has
 * no payments behind it, because the expense form lets a user assert that
 * status directly and a ledger built from payments alone would leave every such
 * debit uncleared.
 *
 * An invoice cannot reach that state. `PUT /api/invoices/[id]` used to grant
 * `{ status: 'PAID' }` by writing the field and nothing else — and did, once, in
 * production — but it now records the settling payment in the same transaction
 * and derives the status from the payment rows afterwards. A PAID invoice
 * therefore always has the money behind it, and a synthetic credit here would
 * have nothing to correct.
 *
 * The rows that predate that fix are left showing what was actually collected —
 * nothing — because that is the truth about the money; it is the status badge
 * that is wrong, and `scripts/repair-invoice-status.ts` corrects it at the
 * source rather than papering over it here.
 */
export function customerMovements(input: {
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
  income: LedgerIncome[];
}): StatementMovement[] {
  const movements: StatementMovement[] = [];

  for (const invoice of input.invoices ?? []) {
    if (!isIssuedInvoice(invoice.status)) continue;
    movements.push({
      id: `invoice:${invoice.id}`,
      kind: 'invoice',
      date: invoice.issueDate,
      currency: invoice.currency,
      reference: text(invoice.invoiceNumber, '—'),
      description: '',
      status: invoice.status ?? null,
      debit: dec(invoice.total),
      href: `/invoices/${invoice.id}`,
    });
  }

  for (const payment of input.payments ?? []) {
    movements.push({
      id: `payment:${payment.id}`,
      kind: 'payment',
      date: payment.paymentDate,
      currency: payment.currency,
      reference: text(payment.paymentMethod, 'other'),
      description: text(payment.documentLabel ?? payment.reference),
      status: null,
      credit: dec(payment.amount),
      href: '/payments',
    });
  }

  for (const row of input.income ?? []) {
    if (row.status !== STATEMENT_INCOME_STATUS) continue;
    movements.push({
      id: `income:${row.id}`,
      kind: 'income',
      date: row.date,
      currency: row.currency,
      reference: text(row.description, '—'),
      description: '',
      status: row.status ?? null,
      debit: dec(row.amount),
      href: '/income',
    });
  }

  return movements;
}

/**
 * Movements on a vendor account: what you owe them.
 *
 * Expenses debit, payments made credit — and then one more row that needs
 * explaining.
 *
 * The expense form lets a user mark an expense PAID directly, without ever
 * recording a Payment against it; that is the common flow for a receipt already
 * settled in cash. Building the ledger from expenses and Payment rows alone
 * would leave every one of those debits uncleared, and a business that records
 * expenses that way would open its first vendor statement to a payable running
 * into the thousands that it does not actually owe.
 *
 * So an expense marked PAID whose recorded payments fall short of its amount
 * gets one settlement credit for the shortfall, dated on the expense itself and
 * labelled as such. It is not an invented payment: it is the settlement the
 * user already asserted by setting the status, shown where the ledger needs it.
 * An expense marked PAID *with* matching payments gets no extra row, so nothing
 * is ever counted twice, and a partially-paid-then-marked-PAID expense gets a
 * settlement for only the remainder.
 *
 * Only payments in the expense's own currency count towards that shortfall,
 * because netting a EUR payment off a USD expense would be a conversion.
 */
export function vendorMovements(input: {
  expenses: LedgerExpense[];
  payments: LedgerPayment[];
}): StatementMovement[] {
  const movements: StatementMovement[] = [];

  for (const payment of input.payments ?? []) {
    movements.push({
      id: `payment:${payment.id}`,
      kind: 'payment',
      date: payment.paymentDate,
      currency: payment.currency,
      reference: text(payment.paymentMethod, 'other'),
      description: text(payment.documentLabel ?? payment.reference),
      status: null,
      credit: dec(payment.amount),
      href: '/payments',
    });
  }

  // Recorded payments per expense, in that expense's currency only.
  const paidByExpense = new Map<string, Decimal>();
  for (const payment of input.payments ?? []) {
    const key = payment.expenseId;
    if (!key) continue;
    paidByExpense.set(key, (paidByExpense.get(key) ?? new Decimal(0)).plus(dec(payment.amount)));
  }

  for (const expense of input.expenses ?? []) {
    const amount = dec(expense.amount);
    movements.push({
      id: `expense:${expense.id}`,
      kind: 'expense',
      date: expense.date,
      currency: expense.currency,
      reference: text(expense.description, '—'),
      description: text(expense.category),
      status: expense.status ?? null,
      debit: amount,
      href: '/expenses',
    });

    if (expense.status !== 'PAID') continue;

    const covered = paidByExpense.get(expense.id) ?? new Decimal(0);
    const shortfall = amount.minus(covered);
    if (shortfall.lte(0)) continue;

    movements.push({
      id: `settlement:${expense.id}`,
      kind: 'settlement',
      date: expense.date,
      currency: expense.currency,
      reference: text(expense.description, '—'),
      description: '',
      status: 'PAID',
      credit: shortfall,
    });
  }

  return movements;
}

/**
 * The customer page's per-currency `outstanding`, reproduced exactly.
 *
 * `SUM(total) - SUM(amountPaid)` over the *issued* invoices, which is what
 * app/api/customers/[id]/route.ts computes and what the detail page shows.
 * Kept here so the statement can be checked against it in a test rather than by
 * eye — and so that the day one of them changes its mind about drafts, a test
 * fails instead of a customer being told they owe money they do not.
 *
 * It used to sum every status, matching a card that did the same. Both were
 * wrong together, which is the failure mode this pairing exists to catch and
 * did not: nothing compared them against a set containing a draft.
 */
export function outstandingByCurrency(
  invoices: Array<Pick<LedgerInvoice, 'status' | 'currency' | 'total' | 'amountPaid'>>,
  fallbackCurrency = 'USD'
): Record<string, string> {
  const totals = new Map<string, Decimal>();

  for (const invoice of invoices ?? []) {
    if (!isIssuedInvoice(invoice.status)) continue;
    const currency = text(invoice.currency, fallbackCurrency);
    const net = dec(invoice.total).minus(dec(invoice.amountPaid));
    totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(net));
  }

  const result: Record<string, string> = {};
  for (const [currency, value] of totals.entries()) result[currency] = value.toFixed(2);
  return result;
}

export interface ReconciliationInput {
  /** The customer page figure, over issued invoices only. */
  outstanding: DecimalLike | null;
  /** The statement's own closing balance for the whole account. */
  statementBalance: DecimalLike | null;
  /** EXPECTED income — on the ledger, not on the card. */
  uninvoicedReceivables: DecimalLike | null;
}

export interface Reconciliation {
  outstanding: string;
  statementBalance: string;
  /** statementBalance - outstanding. */
  difference: string;
  uninvoicedReceivables: string;
  /**
   * True when the difference is entirely accounted for by the known cause.
   *
   * When it is false something else has moved — most often a payment recorded
   * in a currency its invoice was not raised in, which by design never clears
   * that invoice. The UI says so rather than picking one of the two figures and
   * hoping.
   */
  reconciles: boolean;
}

/**
 * Explains the gap between a statement's balance and the customer page's
 * `outstanding`.
 *
 * Two screens disagreeing about what a customer owes is worse than one screen,
 * so the disagreement is computed, named and displayed instead of left for
 * somebody to trip over:
 *
 *     statementBalance = outstanding + uninvoicedReceivables
 *
 * This used to carry a third term. The card summed invoices of every status
 * while the ledger omitted DRAFT and CANCELLED, so drafts were a standing
 * source of difference — which was the polite way of saying the card was wrong.
 * Now that both read `ISSUED_INVOICE_STATUSES`, that difference cannot arise,
 * and a term that can only ever be zero is worse than no term: it invites the
 * reader to look for a discrepancy that no longer exists.
 */
export function reconcileStatement(input: ReconciliationInput): Reconciliation {
  const outstanding = dec(input.outstanding);
  const statementBalance = dec(input.statementBalance);
  const uninvoicedReceivables = dec(input.uninvoicedReceivables);

  const difference = statementBalance.minus(outstanding);

  return {
    outstanding: outstanding.toFixed(2),
    statementBalance: statementBalance.toFixed(2),
    difference: difference.toFixed(2),
    uninvoicedReceivables: uninvoicedReceivables.toFixed(2),
    reconciles: difference.equals(uninvoicedReceivables),
  };
}

import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import type { BankDirection, MatchCandidate, MatchTargetType } from './types';
import { MAX_DATE_DISTANCE_DAYS } from './matching';
// Invoices that can still receive money. The same set the dashboard's
// receivables use — one question, one definition.
import { OPEN_INVOICE_STATUSES } from '@/lib/invoice-status';

/**
 * Assembling the pool of records a bank line could belong to.
 *
 * This is the only module in lib/banking that touches the database; the scoring
 * rules in matching.ts stay pure so they can be tested without one.
 *
 * Every query here is scoped by `companyId` — never by id alone. That is the
 * tenant boundary this application enforces server-side (see
 * requireUserCompany in lib/auth-helpers.ts), and a candidate loader that
 * forgot it would leak another business's invoice amounts into a suggestion
 * list, which is exactly the kind of read that never looks like a breach in a
 * log.
 */



/** Per-kind ceiling on rows pulled into the pool. The date and amount windows
 *  already make the result small; this bounds the pathological case. */
const CANDIDATE_TAKE = 200;

/** Amount slack applied in SQL. Wider than the matcher's one-cent tolerance so
 *  the boundary is decided by Decimal in matching.ts rather than by the database. */
const SQL_AMOUNT_SLACK = 0.05;

export interface CandidateQuery {
  companyId: string;
  /** The line being reconciled. */
  transaction: {
    /** Excluded from the "already linked elsewhere" filter, so the record a line
     *  is currently matched to still appears when changing the match. */
    id?: string;
    date: Date;
    amount: Decimal.Value;
    currency: string;
    direction: BankDirection;
  };
  /** Restricts the pool to certain kinds. Defaults to whatever the direction allows. */
  types?: MatchTargetType[];
}

/** The kinds worth loading for a given direction. */
export function candidateTypesForDirection(direction: BankDirection): MatchTargetType[] {
  return direction === 'CREDIT' ? ['PAYMENT', 'INVOICE', 'INCOME'] : ['PAYMENT', 'EXPENSE'];
}

/** The date window candidates must fall inside. */
function dateWindow(date: Date): { gte: Date; lte: Date } {
  const span = MAX_DATE_DISTANCE_DAYS * 86_400_000;
  return { gte: new Date(date.getTime() - span), lte: new Date(date.getTime() + span) };
}

/** The amount window, as plain numbers for the SQL comparison. */
function amountWindow(amount: Decimal.Value): { gte: number; lte: number } {
  const value = new Decimal(String(amount));
  return {
    gte: value.minus(SQL_AMOUNT_SLACK).toNumber(),
    lte: value.plus(SQL_AMOUNT_SLACK).toNumber(),
  };
}

/**
 * "Not already reconciled against some other bank line."
 *
 * A financial record settles once. Without this, one invoice would be suggested
 * for every credit of the same amount, and a user could reconcile the same
 * invoice against three different deposits.
 *
 * Written as `none: { id: { not: transactionId } }` rather than `none: {}` so the
 * record a line is *currently* matched to is still offered when someone reopens
 * the dialog to change their mind.
 */
function notLinkedElsewhere(transactionId: string | undefined) {
  return transactionId
    ? { bankTransactions: { none: { id: { not: transactionId } } } }
    : { bankTransactions: { none: {} } };
}

/** ISO date string for a candidate, matching what the matcher expects. */
function isoDate(value: Date | null | undefined): string {
  return (value ?? new Date(0)).toISOString();
}

/**
 * Loads every plausible counterpart for one bank line.
 *
 * The result is unscored: `rankCandidates` decides what is actually plausible.
 * The filters below only narrow the pool to something worth scoring.
 */
export async function loadCandidates(query: CandidateQuery): Promise<MatchCandidate[]> {
  const { companyId, transaction } = query;
  const types = query.types ?? candidateTypesForDirection(transaction.direction);
  const window = dateWindow(transaction.date);
  const amount = amountWindow(transaction.amount);
  const unlinked = notLinkedElsewhere(transaction.id);

  const candidates: MatchCandidate[] = [];

  // --- Payments already recorded in the application -------------------------
  // The commonest reconciliation by far: the payment was entered here when it
  // was agreed, and the statement line is the bank confirming it happened.
  if (types.includes('PAYMENT')) {
    const payments = await prisma.payment.findMany({
      where: {
        companyId,
        currency: transaction.currency,
        amount: amount,
        paymentDate: window,
        // A payment's direction follows what it settles: money in for an
        // invoice, money out for an expense.
        ...(transaction.direction === 'CREDIT'
          ? { invoiceId: { not: null } }
          : { expenseId: { not: null } }),
        ...unlinked,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentDate: true,
        reference: true,
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        expense: { select: { description: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: CANDIDATE_TAKE,
    });

    for (const payment of payments) {
      const label = payment.invoice
        ? `Payment for ${payment.invoice.invoiceNumber}`
        : `Payment: ${payment.expense?.description ?? 'expense'}`;
      candidates.push({
        type: 'PAYMENT',
        id: payment.id,
        label,
        // Additive: the English `label` above is unchanged, and the screen
        // prefers the key so the sentence reads in the user's language.
        labelKey: payment.invoice ? 'payments.forInvoice' : 'payments.forExpense',
        labelValues: payment.invoice
          ? { number: payment.invoice.invoiceNumber }
          : { description: payment.expense?.description ?? '' },
        sublabel: payment.invoice?.customer?.name ?? undefined,
        amount: new Decimal(String(payment.amount)).toNumber(),
        currency: payment.currency,
        date: isoDate(payment.paymentDate),
        direction: transaction.direction,
        // The invoice number is far likelier to appear in a bank description
        // than a free-text payment reference, so it is preferred.
        reference: payment.invoice?.invoiceNumber ?? payment.reference ?? undefined,
      });
    }
  }

  // --- Open invoices --------------------------------------------------------
  // Matched on what is still *outstanding*, not the invoice total: a customer
  // settling the remaining half of a part-paid invoice sends the remainder.
  // Prisma cannot compare two columns, so the outstanding amount is filtered in
  // memory after a status- and date-bounded read.
  if (types.includes('INVOICE')) {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        currency: transaction.currency,
        status: { in: [...OPEN_INVOICE_STATUSES] },
        dueDate: window,
        ...unlinked,
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        currency: true,
        dueDate: true,
        customer: { select: { name: true } },
      },
      orderBy: { dueDate: 'desc' },
      take: CANDIDATE_TAKE,
    });

    for (const invoice of invoices) {
      const outstanding = new Decimal(String(invoice.total)).minus(String(invoice.amountPaid));
      if (outstanding.lte(0)) continue;
      if (outstanding.lt(amount.gte) || outstanding.gt(amount.lte)) continue;

      candidates.push({
        type: 'INVOICE',
        id: invoice.id,
        label: `Invoice ${invoice.invoiceNumber}`,
        labelKey: 'banking.matchInvoice',
        labelValues: { number: invoice.invoiceNumber },
        sublabel: invoice.customer?.name ?? undefined,
        amount: outstanding.toNumber(),
        currency: invoice.currency,
        date: isoDate(invoice.dueDate),
        direction: 'CREDIT',
        reference: invoice.invoiceNumber,
      });
    }
  }

  // --- Income entries -------------------------------------------------------
  if (types.includes('INCOME')) {
    const income = await prisma.incomeTransaction.findMany({
      where: {
        companyId,
        currency: transaction.currency,
        amount: amount,
        date: window,
        ...unlinked,
      },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        category: true,
        customer: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: CANDIDATE_TAKE,
    });

    for (const row of income) {
      candidates.push({
        type: 'INCOME',
        id: row.id,
        label: row.description,
        sublabel: row.customer?.name ?? row.category ?? undefined,
        amount: new Decimal(String(row.amount)).toNumber(),
        currency: row.currency,
        date: isoDate(row.date),
        direction: 'CREDIT',
      });
    }
  }

  // --- Expense entries ------------------------------------------------------
  if (types.includes('EXPENSE')) {
    const expenses = await prisma.expenseTransaction.findMany({
      where: {
        companyId,
        currency: transaction.currency,
        amount: amount,
        date: window,
        ...unlinked,
      },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        category: true,
        vendor: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: CANDIDATE_TAKE,
    });

    for (const row of expenses) {
      candidates.push({
        type: 'EXPENSE',
        id: row.id,
        label: row.description,
        sublabel: row.vendor?.name ?? row.category ?? undefined,
        amount: new Decimal(String(row.amount)).toNumber(),
        currency: row.currency,
        date: isoDate(row.date),
        direction: 'DEBIT',
      });
    }
  }

  return candidates;
}

/**
 * Confirms a chosen match target exists, belongs to the caller's company, and is
 * not already reconciled elsewhere.
 *
 * A manual match must never trust the id in the request body. Without this a
 * user could POST another company's invoice id and link a bank line to it —
 * which both leaks that the id exists and, once the reconciliation report reads
 * the relation, would surface a record from a business they have no access to.
 * Returns null when the target is unusable; the route turns that into a 404.
 */
export async function verifyMatchTarget(
  companyId: string,
  type: MatchTargetType,
  id: string,
  transactionId: string
): Promise<{ currency: string; amount: Decimal; direction: BankDirection } | null> {
  const unlinked = notLinkedElsewhere(transactionId);

  if (type === 'INVOICE') {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId, ...unlinked },
      select: { total: true, amountPaid: true, currency: true },
    });
    if (!invoice) return null;
    const outstanding = new Decimal(String(invoice.total)).minus(String(invoice.amountPaid));
    return { currency: invoice.currency, amount: outstanding, direction: 'CREDIT' };
  }

  if (type === 'PAYMENT') {
    const payment = await prisma.payment.findFirst({
      where: { id, companyId, ...unlinked },
      select: { amount: true, currency: true, invoiceId: true },
    });
    if (!payment) return null;
    return {
      currency: payment.currency,
      amount: new Decimal(String(payment.amount)),
      direction: payment.invoiceId ? 'CREDIT' : 'DEBIT',
    };
  }

  if (type === 'INCOME') {
    const income = await prisma.incomeTransaction.findFirst({
      where: { id, companyId, ...unlinked },
      select: { amount: true, currency: true },
    });
    if (!income) return null;
    return {
      currency: income.currency,
      amount: new Decimal(String(income.amount)),
      direction: 'CREDIT',
    };
  }

  const expense = await prisma.expenseTransaction.findFirst({
    where: { id, companyId, ...unlinked },
    select: { amount: true, currency: true },
  });
  if (!expense) return null;
  return {
    currency: expense.currency,
    amount: new Decimal(String(expense.amount)),
    direction: 'DEBIT',
  };
}

/**
 * What the reconciliation screen shows for an already-matched line, and where
 * its "open the record" link points.
 *
 * The route into the application is deliberately an existing page in every case
 * — this feature adds no new detail screens for records that already have them.
 */
export function describeMatch(row: {
  matchedInvoice?: { id: string; invoiceNumber: string; customer?: { name: string } | null } | null;
  matchedPayment?: { id: string; reference: string | null; invoiceId: string | null } | null;
  matchedIncome?: { id: string; description: string } | null;
  matchedExpense?: { id: string; description: string } | null;
}): {
  type: MatchTargetType;
  id: string;
  label: string;
  /** Translation key, or null when the label is the user's own text. */
  labelKey: string | null;
  labelValues: Record<string, string>;
  href: string;
} | null {
  if (row.matchedInvoice) {
    return {
      type: 'INVOICE',
      id: row.matchedInvoice.id,
      label: `Invoice ${row.matchedInvoice.invoiceNumber}`,
      labelKey: 'banking.matchInvoice',
      labelValues: { number: row.matchedInvoice.invoiceNumber },
      href: `/invoices/${row.matchedInvoice.id}`,
    };
  }
  if (row.matchedPayment) {
    return {
      type: 'PAYMENT',
      id: row.matchedPayment.id,
      label: row.matchedPayment.reference
        ? `Payment ${row.matchedPayment.reference}`
        : 'Recorded payment',
      labelKey: row.matchedPayment.reference
        ? 'banking.matchPaymentRef'
        : 'banking.matchRecordedPayment',
      labelValues: { reference: row.matchedPayment.reference ?? '' },
      // Payments have no detail page; the list is where they can be edited.
      href: '/payments',
    };
  }
  if (row.matchedIncome) {
    return {
      type: 'INCOME',
      id: row.matchedIncome.id,
      // User-entered text: shown as it is, never translated.
      label: row.matchedIncome.description,
      labelKey: null,
      labelValues: {},
      href: '/income',
    };
  }
  if (row.matchedExpense) {
    return {
      type: 'EXPENSE',
      id: row.matchedExpense.id,
      label: row.matchedExpense.description,
      labelKey: null,
      labelValues: {},
      href: '/expenses',
    };
  }
  return null;
}

/** The `include` every route uses when it needs the matched record for display. */
export const MATCH_INCLUDE = {
  matchedInvoice: {
    select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
  },
  matchedPayment: { select: { id: true, reference: true, invoiceId: true } },
  matchedIncome: { select: { id: true, description: true } },
  matchedExpense: { select: { id: true, description: true } },
} as const;

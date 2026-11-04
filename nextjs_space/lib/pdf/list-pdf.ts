/**
 * Lists and reports → PDF.
 *
 * Pure: every builder here takes rows that `lib/pdf/list-data.ts` has already
 * loaded with the screen's own filter, and turns them into a spec for the
 * shared engine. No database, so the unit tests and the sample script build
 * exactly the documents the route serves.
 *
 * These documents are read-outs of what a company already has. Unlike an
 * invoice or a quote they are not counted against the plan's monthly PDF
 * allowance (the route never calls `enforcePlanLimit`).
 */
import Decimal from 'decimal.js';
import { fillTranslation, translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/email/templates';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { quoteStatusBadge } from '@/lib/quote-status';
import {
  getChequeStatusBadge,
  CHEQUE_DIRECTION_LABEL_KEYS,
  CHEQUE_INSTRUMENT_LABEL_KEYS,
  type ChequeDirection,
  type ChequeInstrumentType,
} from '@/lib/cheque-status';
import { paymentMethodLabelKey } from '@/lib/validation';
import type { ReportsPayload } from '@/lib/reports-aggregate';
import type { VatCurrencyReport } from '@/lib/vat-report';
import {
  logoFromDataUrl,
  renderBusinessDocumentPdf,
  type BusinessDocumentSpec,
  type DocBlock,
  type DocColumn,
  type DocRow,
} from './engine';

export const LIST_PDF_KINDS = [
  'invoices',
  'quotes',
  'recurring',
  'customers',
  'vendors',
  'expenses',
  'income',
  'payments',
  'cheques',
  'bank-transactions',
  'bank-accounts',
  'vat',
  'reports',
] as const;
export type ListPdfKind = (typeof LIST_PDF_KINDS)[number];

export function isListPdfKind(value: unknown): value is ListPdfKind {
  return typeof value === 'string' && (LIST_PDF_KINDS as readonly string[]).includes(value);
}

/** Upper bound on rows in one list document; beyond it the document says so. */
export const LIST_PDF_MAX_ROWS = 2000;

const TITLE_KEYS: Record<ListPdfKind, TranslationKey> = {
  invoices: 'listPdf.title.invoices',
  quotes: 'listPdf.title.quotes',
  recurring: 'listPdf.title.recurring',
  customers: 'listPdf.title.customers',
  vendors: 'listPdf.title.vendors',
  expenses: 'listPdf.title.expenses',
  income: 'listPdf.title.income',
  payments: 'listPdf.title.payments',
  cheques: 'listPdf.title.cheques',
  'bank-transactions': 'listPdf.title.bankTransactions',
  'bank-accounts': 'listPdf.title.bankAccounts',
  vat: 'listPdf.title.vat',
  reports: 'listPdf.title.reports',
};

const MONEY_STATUS_KEYS: Record<string, TranslationKey> = {
  PAID: 'status.paid',
  UNPAID: 'status.unpaid',
  EXPECTED: 'status.expected',
  RECEIVED: 'status.received',
};

const FREQUENCY_KEYS: Record<string, TranslationKey> = {
  MONTHLY: 'recurring.monthly',
  QUARTERLY: 'recurring.quarterly',
  YEARLY: 'recurring.yearly',
};

const BANK_STATUS_KEYS: Record<string, TranslationKey> = {
  UNMATCHED: 'banking.toReconcile',
  MATCHED: 'banking.matched',
  IGNORED: 'banking.ignored',
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export interface ListContext {
  locale: Locale;
  t: (key: TranslationKey) => string;
  money: (amount: unknown, currency: string) => string;
  date: (value: unknown) => string;
}

export function listContext(locale: Locale): ListContext {
  const fmt = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return {
    locale,
    t: (key) => translate(locale, key),
    money: (amount, currency) => formatMoney(amount, currency || 'USD', locale),
    // Calendar dates are stored as UTC midnight, so they are read in UTC.
    date: (value) => {
      if (value === null || value === undefined || value === '') return '';
      const d = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(d.getTime()) ? '' : fmt.format(d);
    },
  };
}

const dec = (value: unknown): Decimal => {
  try {
    const d = new Decimal(String(value ?? 0));
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Sums one or more fields per currency, currencies in alphabetical order. */
function sumByCurrency<T>(
  rows: T[],
  currencyOf: (row: T) => string,
  fields: Record<string, (row: T) => unknown>
): Array<{ currency: string; sums: Record<string, Decimal> }> {
  const map = new Map<string, Record<string, Decimal>>();
  for (const row of rows) {
    const currency = currencyOf(row) || 'USD';
    const sums = map.get(currency) ?? Object.fromEntries(Object.keys(fields).map((k) => [k, new Decimal(0)]));
    for (const [name, get] of Object.entries(fields)) sums[name] = sums[name].plus(dec(get(row)));
    map.set(currency, sums);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, sums]) => ({ currency, sums }));
}

function totalsBlock(
  ctx: ListContext,
  groups: Array<{ currency: string; sums: Record<string, Decimal> }>,
  lines: Array<{ field: string; labelKey: TranslationKey; strong?: boolean }>
): DocBlock | null {
  if (groups.length === 0) return null;
  const out: Array<{ label: string; value: string; strong?: boolean }> = [];
  for (const group of groups) {
    for (const line of lines) {
      out.push({
        label: fillTranslation(ctx.locale, line.labelKey, { currency: group.currency }),
        value: ctx.money(group.sums[line.field].toFixed(2), group.currency),
        strong: line.strong,
      });
    }
  }
  return { kind: 'totals', lines: out };
}

function table(ctx: ListContext, columns: DocColumn[], rows: DocRow[]): DocBlock {
  return { kind: 'table', columns, rows, emptyText: ctx.t('listPdf.empty') };
}

const col = (ctx: ListContext, key: TranslationKey, width: number, align?: 'right'): DocColumn => ({
  label: ctx.t(key),
  width,
  ...(align ? { align } : {}),
});

/** One per-period amount for a recurring template, the same formula the screen uses. */
export function recurringAmount(items: any[]): Decimal {
  let total = new Decimal(0);
  for (const item of items ?? []) {
    const base = dec(item?.quantity).mul(dec(item?.unitPrice));
    const net = Decimal.max(base.minus(dec(item?.discount)), 0);
    total = total.plus(base.minus(dec(item?.discount))).plus(net.mul(dec(item?.taxRate)).div(100));
  }
  return total.toDecimalPlaces(2);
}

// ---------------------------------------------------------------------------
// Per-kind bodies
// ---------------------------------------------------------------------------

export interface ListBody {
  blocks: DocBlock[];
  /** Shown as "Records: n"; left out for reports. */
  recordCount?: number;
}

export function invoicesBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.number', 20),
      col(ctx, 'export.col.customer', 19),
      col(ctx, 'export.col.status', 12),
      col(ctx, 'export.col.issueDate', 11),
      col(ctx, 'cheques.dueDate', 11),
      col(ctx, 'export.col.total', 13.5, 'right'),
      col(ctx, 'export.col.outstanding', 13.5, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        String(r.invoiceNumber ?? ''),
        String(r.customer?.name ?? ''),
        ctx.t(getStatusBadge(String(r.status)).labelKey),
        ctx.date(r.issueDate),
        ctx.date(r.dueDate),
        ctx.money(r.total, r.currency),
        ctx.money(dec(r.total).minus(dec(r.amountPaid)).toFixed(2), r.currency),
      ],
    }))
  );
  const totals = totalsBlock(
    ctx,
    sumByCurrency(rows, (r) => r.currency, {
      total: (r) => r.total,
      outstanding: (r) => dec(r.total).minus(dec(r.amountPaid)),
    }),
    [
      { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
      { field: 'outstanding', labelKey: 'listPdf.outstandingFor' },
    ]
  );
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

export function quotesBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.number', 19),
      col(ctx, 'export.col.customer', 24),
      col(ctx, 'export.col.status', 14),
      col(ctx, 'export.col.issueDate', 13),
      col(ctx, 'export.col.validUntil', 13),
      col(ctx, 'export.col.total', 17, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        String(r.quoteNumber ?? ''),
        String(r.customer?.name ?? ''),
        ctx.t(quoteStatusBadge(r.status).labelKey),
        ctx.date(r.issueDate),
        ctx.date(r.validUntil),
        ctx.money(r.total, r.currency),
      ],
    }))
  );
  const totals = totalsBlock(ctx, sumByCurrency(rows, (r) => r.currency, { total: (r) => r.total }), [
    { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
  ]);
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

export function recurringBody(rows: any[], ctx: ListContext): ListBody {
  const amountOf = (r: any) => recurringAmount(r.items ?? []);
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.name', 20),
      col(ctx, 'export.col.customer', 20),
      col(ctx, 'listPdf.col.frequency', 13),
      col(ctx, 'listPdf.col.nextRun', 14),
      col(ctx, 'listPdf.col.state', 15),
      col(ctx, 'export.col.amount', 18, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        nonEmpty(r.name) ? r.name : String(r.customer?.name ?? ''),
        String(r.customer?.name ?? ''),
        ctx.t(FREQUENCY_KEYS[r.frequency] ?? 'recurring.monthly'),
        r.isActive ? ctx.date(r.nextRunDate) : '—',
        ctx.t(r.isActive ? 'recurring.active' : 'recurring.paused'),
        ctx.money(amountOf(r).toFixed(2), r.currency),
      ],
    }))
  );
  const totals = totalsBlock(
    ctx,
    sumByCurrency(rows.filter((r) => r.isActive), (r) => r.currency, { total: amountOf }),
    [{ field: 'total', labelKey: 'listPdf.totalFor', strong: true }]
  );
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

function partyRows(rows: any[], ctx: ListContext): DocRow[] {
  return rows.map((r) => ({
    cells: [
      String(r.name ?? ''),
      String(r.email ?? ''),
      String(r.phone ?? ''),
      [r.taxId, r.taxOffice].filter(nonEmpty).join(' / '),
      [r.city, r.country].filter(nonEmpty).join(', '),
    ],
    detail: nonEmpty(r.companyName) ? r.companyName : undefined,
  }));
}

function partyColumns(ctx: ListContext): DocColumn[] {
  return [
    col(ctx, 'export.col.name', 27),
    col(ctx, 'export.col.email', 24),
    col(ctx, 'export.col.phone', 15),
    col(ctx, 'export.col.taxId', 19),
    col(ctx, 'export.col.city', 15),
  ];
}

export function customersBody(rows: any[], ctx: ListContext): ListBody {
  return { blocks: [table(ctx, partyColumns(ctx), partyRows(rows, ctx))], recordCount: rows.length };
}

export function vendorsBody(rows: any[], ctx: ListContext): ListBody {
  const columns = partyColumns(ctx);
  columns[4] = col(ctx, 'export.col.country', 15);
  return { blocks: [table(ctx, columns, partyRows(rows, ctx))], recordCount: rows.length };
}

export function expensesBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.date', 12),
      col(ctx, 'export.col.description', 30),
      col(ctx, 'export.col.vendor', 18),
      col(ctx, 'export.col.status', 11),
      col(ctx, 'export.col.vatAmount', 13, 'right'),
      col(ctx, 'export.col.amount', 16, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        ctx.date(r.date),
        String(r.description ?? ''),
        String(r.vendor?.name ?? ''),
        MONEY_STATUS_KEYS[r.status] ? ctx.t(MONEY_STATUS_KEYS[r.status]) : String(r.status ?? ''),
        r.taxAmount === null || r.taxAmount === undefined ? '' : ctx.money(r.taxAmount, r.currency),
        ctx.money(r.amount, r.currency),
      ],
      detail: nonEmpty(r.category) ? r.category : undefined,
    }))
  );
  const totals = totalsBlock(
    ctx,
    sumByCurrency(rows, (r) => r.currency, {
      total: (r) => r.amount,
      paid: (r) => (r.status === 'PAID' ? r.amount : 0),
    }),
    [
      { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
      { field: 'paid', labelKey: 'listPdf.paidFor' },
    ]
  );
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

export function incomeBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.date', 12),
      col(ctx, 'export.col.description', 34),
      col(ctx, 'export.col.customer', 22),
      col(ctx, 'export.col.status', 14),
      col(ctx, 'export.col.amount', 18, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        ctx.date(r.date),
        String(r.description ?? ''),
        String(r.customer?.name ?? ''),
        MONEY_STATUS_KEYS[r.status] ? ctx.t(MONEY_STATUS_KEYS[r.status]) : String(r.status ?? ''),
        ctx.money(r.amount, r.currency),
      ],
      detail: nonEmpty(r.category) ? r.category : undefined,
    }))
  );
  const totals = totalsBlock(ctx, sumByCurrency(rows, (r) => r.currency, { total: (r) => r.amount }), [
    { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
  ]);
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

export function paymentsBody(rows: any[], ctx: ListContext): ListBody {
  const incoming = (r: any) => Boolean(r.invoiceId ?? r.invoice);
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.date', 12),
      col(ctx, 'export.col.direction', 11),
      col(ctx, 'export.col.party', 20),
      col(ctx, 'export.col.document', 17),
      col(ctx, 'export.col.method', 13),
      col(ctx, 'export.col.reference', 12),
      col(ctx, 'export.col.amount', 15, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        ctx.date(r.paymentDate),
        ctx.t(incoming(r) ? 'export.direction.in' : 'export.direction.out'),
        String(r.invoice?.customer?.name ?? r.expense?.vendor?.name ?? ''),
        String(r.invoice?.invoiceNumber ?? r.expense?.description ?? ''),
        ctx.t(paymentMethodLabelKey(r.paymentMethod)),
        String(r.reference ?? ''),
        ctx.money(r.amount, r.currency),
      ],
    }))
  );
  const groups = sumByCurrency(rows, (r) => r.currency, {
    in: (r) => (incoming(r) ? r.amount : 0),
    out: (r) => (incoming(r) ? 0 : r.amount),
  });
  const lines = groups.flatMap((g) => [
    { label: `${ctx.t('export.direction.in')} (${g.currency})`, value: ctx.money(g.sums.in.toFixed(2), g.currency) },
    { label: `${ctx.t('export.direction.out')} (${g.currency})`, value: ctx.money(g.sums.out.toFixed(2), g.currency) },
  ]);
  return {
    blocks: lines.length ? [body, { kind: 'totals', lines }] : [body],
    recordCount: rows.length,
  };
}

export function chequesBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'cheques.dueDate', 12),
      col(ctx, 'export.col.direction', 11),
      col(ctx, 'listPdf.col.instrument', 12),
      col(ctx, 'listPdf.col.numberBank', 17),
      col(ctx, 'export.col.party', 19),
      col(ctx, 'export.col.status', 13),
      col(ctx, 'export.col.amount', 16, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        ctx.date(r.dueDate),
        ctx.t(CHEQUE_DIRECTION_LABEL_KEYS[r.direction as ChequeDirection] ?? 'cheques.directionReceived'),
        ctx.t(CHEQUE_INSTRUMENT_LABEL_KEYS[r.instrument as ChequeInstrumentType] ?? 'cheques.instrumentCheque'),
        [r.chequeNumber, r.bankName].filter(nonEmpty).join(' / '),
        String(r.customer?.name ?? r.vendor?.name ?? r.drawerName ?? ''),
        ctx.t(getChequeStatusBadge(r.status).labelKey),
        ctx.money(r.amount, r.currency),
      ],
    }))
  );
  const totals = totalsBlock(ctx, sumByCurrency(rows, (r) => r.currency, { total: (r) => r.amount }), [
    { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
  ]);
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

/** `effectiveStatus` is computed by the loader with the reconciliation rule. */
export function bankTransactionsBody(rows: any[], ctx: ListContext): ListBody {
  const signed = (r: any) => (r.direction === 'DEBIT' ? dec(r.amount).negated() : dec(r.amount));
  const body = table(
    ctx,
    [
      col(ctx, 'export.col.date', 12),
      col(ctx, 'listPdf.col.account', 20),
      col(ctx, 'export.col.description', 37),
      col(ctx, 'export.col.status', 14),
      col(ctx, 'export.col.amount', 17, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        ctx.date(r.date),
        [r.bankAccount?.bankName, r.bankAccount?.accountName].filter(nonEmpty).join(' – '),
        String(r.description ?? ''),
        ctx.t(BANK_STATUS_KEYS[r.effectiveStatus] ?? 'banking.toReconcile'),
        ctx.money(signed(r).toFixed(2), r.currency),
      ],
      detail: nonEmpty(r.reference) ? r.reference : undefined,
    }))
  );
  const totals = totalsBlock(ctx, sumByCurrency(rows, (r) => r.currency, { total: signed }), [
    { field: 'total', labelKey: 'listPdf.totalFor', strong: true },
  ]);
  return { blocks: totals ? [body, totals] : [body], recordCount: rows.length };
}

export function bankAccountsBody(rows: any[], ctx: ListContext): ListBody {
  const body = table(
    ctx,
    [
      col(ctx, 'cheques.bankName', 20),
      col(ctx, 'listPdf.col.account', 20),
      col(ctx, 'listPdf.col.iban', 27),
      col(ctx, 'listPdf.col.state', 11),
      col(ctx, 'listPdf.col.balance', 22, 'right'),
    ],
    rows.map((r) => ({
      cells: [
        String(r.bankName ?? ''),
        String(r.accountName ?? ''),
        String(r.iban ?? r.accountNumber ?? ''),
        ctx.t(r.isActive === false ? 'listPdf.inactive' : 'listPdf.active'),
        r.lastBalance === null || r.lastBalance === undefined ? '—' : ctx.money(r.lastBalance, r.currency),
      ],
      detail: r.lastBalanceAt ? ctx.date(r.lastBalanceAt) : undefined,
    }))
  );
  return { blocks: [body], recordCount: rows.length };
}

export function vatBody(currencies: VatCurrencyReport[], ctx: ListContext): ListBody {
  const rate = (r: string) => (r === '?' ? ctx.t('vat.rateUnknown') : `%${r}`);
  const blocks: DocBlock[] = [];
  for (const cur of currencies) {
    const m = (v: unknown) => ctx.money(v, cur.currency);
    const rows: DocRow[] = [];
    for (const line of cur.output) rows.push({ cells: [ctx.t('vat.output'), rate(line.rate), m(line.base), m(line.tax)] });
    rows.push({ cells: [ctx.t('vat.outputTotal'), '', m(cur.outputBase), m(cur.outputTax)], style: 'strong' });
    for (const line of cur.input) rows.push({ cells: [ctx.t('vat.input'), rate(line.rate), m(line.base), m(line.tax)] });
    rows.push({ cells: [ctx.t('vat.inputTotal'), '', m(cur.inputBase), m(cur.inputTax)], style: 'strong' });
    // A positive result is VAT to pay; a negative one carries forward. The
    // label carries the sign, so the amount is printed without it.
    const net = dec(cur.net);
    rows.push({
      cells: [ctx.t(net.isNegative() ? 'vat.carryForward' : 'vat.payable'), '', '', m(net.abs().toFixed(2))],
      style: 'strong',
    });
    blocks.push({
      kind: 'table',
      heading: currencies.length > 1 ? cur.currency : undefined,
      columns: [
        col(ctx, 'export.col.section', 40),
        col(ctx, 'vat.rate', 16),
        col(ctx, 'export.col.base', 22, 'right'),
        col(ctx, 'export.col.vatAmount', 22, 'right'),
      ],
      rows,
    });
  }
  if (blocks.length === 0) blocks.push({ kind: 'text', body: ctx.t('listPdf.empty') });
  blocks.push({ kind: 'text', body: ctx.t('vat.notice'), boxed: true, small: true });
  return { blocks };
}

function monthText(key: string, locale: Locale): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

/**
 * The finance report. `primaryCurrency` (the company's own currency) comes
 * first, the others after it in alphabetical order.
 */
export function reportsBody(report: ReportsPayload, ctx: ListContext, primaryCurrency?: string | null): ListBody {
  const blocks: DocBlock[] = [];
  const multi = report.currencies.length > 1;
  const ordered = [...report.currencies].sort((a, b) =>
    a === primaryCurrency ? -1 : b === primaryCurrency ? 1 : a.localeCompare(b)
  );
  for (const cur of ordered) {
    const totals = report.byCurrency[cur];
    if (!totals) continue;
    const m = (v: unknown) => ctx.money(v, cur);
    const suffix = multi ? ` (${cur})` : '';
    blocks.push({
      kind: 'table',
      heading: ctx.t('listPdf.section.summary') + suffix,
      columns: [col(ctx, 'listPdf.col.item', 60), col(ctx, 'listPdf.col.value', 40, 'right')],
      rows: [
        { cells: [ctx.t('reports.totalIncome'), m(totals.income)] },
        { cells: [ctx.t('reports.totalExpenses'), m(totals.expenses)] },
        // A negative result is a loss: the label says so and the amount is
        // printed without its minus sign.
        dec(totals.profit).isNegative()
          ? { cells: [ctx.t('listPdf.col.loss'), m(dec(totals.profit).abs().toFixed(2))], style: 'strong' as const }
          : { cells: [ctx.t('listPdf.col.profit'), m(totals.profit)], style: 'strong' as const },
        { cells: [ctx.t('reports.totalInvoiced'), m(totals.invoiced)] },
        { cells: [ctx.t('reports.collected'), m(totals.collected)] },
        { cells: [ctx.t('listPdf.row.outstanding'), m(totals.outstanding)] },
        { cells: [ctx.t('listPdf.row.unpaidExpenses'), m(totals.unpaidExpenses)], style: 'muted' },
      ],
    });
    const months = (report.monthly[cur] ?? []).filter((p) => p.income !== 0 || p.expenses !== 0);
    if (months.length > 0) {
      blocks.push({
        kind: 'table',
        heading: ctx.t('listPdf.section.monthly') + suffix,
        columns: [
          col(ctx, 'listPdf.col.month', 31),
          col(ctx, 'reports.income', 23, 'right'),
          col(ctx, 'reports.expenses', 23, 'right'),
          col(ctx, 'listPdf.col.profitLoss', 23, 'right'),
        ],
        rows: months.map((p) => ({
          cells: [monthText(p.monthKey, ctx.locale), m(p.income), m(p.expenses), m(dec(p.income).minus(dec(p.expenses)).toFixed(2))],
        })),
      });
    }
    const categories = report.expenseCategories[cur] ?? [];
    if (categories.length > 0) {
      blocks.push({
        kind: 'table',
        heading: ctx.t('listPdf.section.categories') + suffix,
        columns: [col(ctx, 'export.col.category', 60), col(ctx, 'export.col.amount', 40, 'right')],
        rows: categories.map((c) => ({ cells: [c.name, m(c.value)] })),
      });
    }
  }
  if (report.invoiceStatusCounts.length > 0) {
    blocks.push({
      kind: 'table',
      heading: ctx.t('listPdf.section.invoiceStatus'),
      columns: [col(ctx, 'export.col.status', 60), col(ctx, 'listPdf.col.count', 40, 'right')],
      rows: report.invoiceStatusCounts.map((s) => ({
        cells: [ctx.t(getStatusBadge(s.name).labelKey), String(s.value)],
      })),
    });
  }
  if (blocks.length === 0) blocks.push({ kind: 'text', body: ctx.t('listPdf.empty') });
  blocks.push({ kind: 'text', body: ctx.t('listPdf.reportBasis'), small: true });
  return { blocks };
}

// ---------------------------------------------------------------------------
// The document around a body
// ---------------------------------------------------------------------------

export interface ListDocumentInput {
  kind: ListPdfKind;
  locale: Locale;
  company: any;
  /** Already worded for the reader: [{ label: 'Durum', value: 'Ödendi' }]. */
  filters: Array<{ label: string; value: string }>;
  body: ListBody;
  /** Set when the query hit LIST_PDF_MAX_ROWS. */
  truncatedAt?: number | null;
  generatedAt?: Date;
}

export function buildListPdfSpec(input: ListDocumentInput): BusinessDocumentSpec {
  const ctx = listContext(input.locale);
  const { t } = ctx;
  const company = input.company ?? {};
  const generatedAt = input.generatedAt ?? new Date();

  const issuerLines: string[] = [];
  if (nonEmpty(company.legalName) && company.legalName !== company.name) issuerLines.push(company.legalName);
  if (nonEmpty(company.taxNumber)) {
    issuerLines.push(
      [`${t('pdf.taxId')}: ${company.taxNumber}`, nonEmpty(company.taxOffice) ? `${t('pdf.taxOffice')}: ${company.taxOffice}` : '']
        .filter(Boolean)
        .join(' • ')
    );
  }
  const contact = [company.email, company.phone].filter(nonEmpty).join(' • ');
  if (contact) issuerLines.push(contact);

  const meta = [{ label: t('listPdf.generatedAt'), value: ctx.date(generatedAt) }];
  if (typeof input.body.recordCount === 'number') {
    meta.push({ label: t('listPdf.recordCount'), value: String(input.body.recordCount) });
  }

  const filterText = input.filters.length
    ? input.filters.map((f) => `${f.label}: ${f.value}`).join(' • ')
    : t('listPdf.noFilter');
  const blocks: DocBlock[] = [{ kind: 'text', title: t('listPdf.filters'), body: filterText, boxed: true, small: true }];
  if (input.truncatedAt) {
    blocks.push({
      kind: 'text',
      body: fillTranslation(input.locale, 'listPdf.truncated', { max: String(input.truncatedAt) }),
      small: true,
    });
  }
  blocks.push(...input.body.blocks);

  const title = t(TITLE_KEYS[input.kind]);
  return {
    title,
    brandColor: company.primaryColor,
    logo: company.invoiceShowLogo === false ? null : logoFromDataUrl(company.logoUrl),
    issuer: { name: String(company.name ?? ''), lines: issuerLines },
    party: null,
    meta,
    blocks,
    footer: String(company.name ?? ''),
    pageLabel: fillTranslation(input.locale, 'pdf.page', { page: '{page}', total: '{total}' }),
    metadata: {
      title,
      author: String(company.name ?? ''),
      language: input.locale === 'tr' ? 'tr-TR' : 'en-US',
    },
    createdAt: generatedAt,
  };
}

export function renderListPdf(input: ListDocumentInput): Promise<Uint8Array> {
  return renderBusinessDocumentPdf(buildListPdfSpec(input));
}

export function listPdfFileName(kind: ListPdfKind, now: Date = new Date()): string {
  return `corpcontrol-${kind}-${now.toISOString().slice(0, 10)}.pdf`;
}

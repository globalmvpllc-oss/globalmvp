import 'server-only';
import { prisma } from '@/lib/db';
import { translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { paymentMethodLabelKey } from '@/lib/validation';
import { quoteStatusBadge } from '@/lib/quote-status';
import { loadVatReport } from '@/lib/vat-report-data';
import type { Table, TableColumn, ColumnType } from './tabular';

/**
 * The exportable datasets. Every query is scoped by the session's companyId,
 * which the route passes in; nothing from the request selects the company.
 * Headers and status words follow the reader's language; stored values
 * (names, numbers) are exported as they are.
 */
export const EXPORT_DATASETS = ['invoices', 'customers', 'income', 'expenses', 'payments', 'quotes', 'vat'] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: unknown): value is ExportDataset {
  return typeof value === 'string' && (EXPORT_DATASETS as readonly string[]).includes(value);
}

/** Upper bound on rows per export. */
export const EXPORT_MAX_ROWS = 10000;

export interface ExportPeriod {
  gte?: Date;
  lt?: Date;
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  PAID: 'status.paid',
  UNPAID: 'status.unpaid',
  EXPECTED: 'status.expected',
  RECEIVED: 'status.received',
};

function columns(locale: Locale, spec: Array<[TranslationKey, ColumnType?]>): TableColumn[] {
  return spec.map(([key, type]) => ({ header: translate(locale, key), type: type ?? 'text' }));
}

const range = (period: ExportPeriod) =>
  period.gte || period.lt ? { ...(period.gte ? { gte: period.gte } : {}), ...(period.lt ? { lt: period.lt } : {}) } : undefined;

export async function buildExportTables(
  dataset: ExportDataset,
  companyId: string,
  locale: Locale,
  period: ExportPeriod & { from?: string; to?: string }
): Promise<Table[]> {
  const t = (key: TranslationKey) => translate(locale, key);
  const window = range(period);

  switch (dataset) {
    case 'invoices': {
      const rows = await prisma.invoice.findMany({
        where: { companyId, ...(window ? { issueDate: window } : {}) },
        include: { customer: { select: { name: true, taxId: true } } },
        orderBy: { issueDate: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      return [{
        name: t('export.sheet.invoices'),
        columns: columns(locale, [
          ['export.col.number'], ['export.col.customer'], ['export.col.taxId'], ['export.col.status'],
          ['export.col.issueDate', 'date'], ['export.col.dueDate', 'date'], ['export.col.currency'],
          ['export.col.subtotal', 'money'], ['export.col.discount', 'money'], ['export.col.tax', 'money'],
          ['export.col.total', 'money'], ['export.col.paid', 'money'], ['export.col.outstanding', 'money'],
        ]),
        rows: rows.map((r) => [
          r.invoiceNumber, r.customer?.name ?? '', r.customer?.taxId ?? '', t(getStatusBadge(r.status).labelKey),
          r.issueDate, r.dueDate, r.currency, r.subtotal, r.discountTotal, r.taxTotal, r.total, r.amountPaid,
          Number(r.total) - Number(r.amountPaid),
        ]),
      }];
    }
    case 'quotes': {
      const rows = await prisma.quote.findMany({
        where: { companyId, ...(window ? { issueDate: window } : {}) },
        include: { customer: { select: { name: true } }, convertedInvoice: { select: { invoiceNumber: true } } },
        orderBy: { issueDate: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      return [{
        name: t('export.sheet.quotes'),
        columns: columns(locale, [
          ['export.col.number'], ['export.col.customer'], ['export.col.status'], ['export.col.issueDate', 'date'],
          ['export.col.validUntil', 'date'], ['export.col.currency'], ['export.col.tax', 'money'],
          ['export.col.total', 'money'], ['export.col.invoice'],
        ]),
        rows: rows.map((r) => [
          r.quoteNumber, r.customer?.name ?? '', t(quoteStatusBadge(r.status).labelKey), r.issueDate, r.validUntil,
          r.currency, r.taxTotal, r.total, r.convertedInvoice?.invoiceNumber ?? '',
        ]),
      }];
    }
    case 'customers': {
      const rows = await prisma.customer.findMany({ where: { companyId }, orderBy: { name: 'asc' }, take: EXPORT_MAX_ROWS });
      return [{
        name: t('export.sheet.customers'),
        columns: columns(locale, [
          ['export.col.name'], ['export.col.company'], ['export.col.email'], ['export.col.phone'],
          ['export.col.taxId'], ['export.col.taxOffice'], ['export.col.address'], ['export.col.city'],
          ['export.col.country'], ['export.col.currency'],
        ]),
        rows: rows.map((r) => [
          r.name, r.companyName, r.email, r.phone, r.taxId, r.taxOffice, r.address, r.city, r.country, r.defaultCurrency,
        ]),
      }];
    }
    case 'income': {
      const rows = await prisma.incomeTransaction.findMany({
        where: { companyId, ...(window ? { date: window } : {}) },
        include: { customer: { select: { name: true } } },
        orderBy: { date: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      return [{
        name: t('export.sheet.income'),
        columns: columns(locale, [
          ['export.col.date', 'date'], ['export.col.description'], ['export.col.category'], ['export.col.customer'],
          ['export.col.status'], ['export.col.currency'], ['export.col.amount', 'money'],
        ]),
        rows: rows.map((r) => [
          r.date, r.description, r.category, r.customer?.name ?? '',
          STATUS_KEYS[r.status] ? t(STATUS_KEYS[r.status]) : r.status, r.currency, r.amount,
        ]),
      }];
    }
    case 'expenses': {
      const rows = await prisma.expenseTransaction.findMany({
        where: { companyId, ...(window ? { date: window } : {}) },
        include: { vendor: { select: { name: true, taxId: true } } },
        orderBy: { date: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      return [{
        name: t('export.sheet.expenses'),
        columns: columns(locale, [
          ['export.col.date', 'date'], ['export.col.description'], ['export.col.category'], ['export.col.vendor'],
          ['export.col.taxId'], ['export.col.status'], ['export.col.currency'], ['export.col.amount', 'money'],
          ['export.col.vatRate', 'number'], ['export.col.vatAmount', 'money'],
        ]),
        rows: rows.map((r) => [
          r.date, r.description, r.category, r.vendor?.name ?? '', r.vendor?.taxId ?? '',
          STATUS_KEYS[r.status] ? t(STATUS_KEYS[r.status]) : r.status, r.currency, r.amount, r.taxRate, r.taxAmount,
        ]),
      }];
    }
    case 'payments': {
      const rows = await prisma.payment.findMany({
        where: { companyId, ...(window ? { paymentDate: window } : {}) },
        include: {
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
          expense: { select: { description: true, vendor: { select: { name: true } } } },
        },
        orderBy: { paymentDate: 'asc' },
        take: EXPORT_MAX_ROWS,
      });
      return [{
        name: t('export.sheet.payments'),
        columns: columns(locale, [
          ['export.col.date', 'date'], ['export.col.direction'], ['export.col.party'], ['export.col.document'],
          ['export.col.method'], ['export.col.reference'], ['export.col.currency'], ['export.col.amount', 'money'],
        ]),
        rows: rows.map((r) => [
          r.paymentDate,
          r.invoiceId ? t('export.direction.in') : t('export.direction.out'),
          r.invoice?.customer?.name ?? r.expense?.vendor?.name ?? '',
          r.invoice?.invoiceNumber ?? r.expense?.description ?? '',
          t(paymentMethodLabelKey(r.paymentMethod)),
          r.reference,
          r.currency,
          r.amount,
        ]),
      }];
    }
    case 'vat': {
      const report = await loadVatReport(companyId, { gte: period.gte!, lt: period.lt! });
      const rateText = (rate: string) => (rate === '?' ? t('vat.rateUnknown') : `%${rate}`);
      const rows: unknown[][] = [];
      for (const cur of report.currencies) {
        for (const line of cur.output) rows.push([t('vat.output'), cur.currency, rateText(line.rate), line.base, line.tax]);
        rows.push([t('vat.outputTotal'), cur.currency, '', cur.outputBase, cur.outputTax]);
        for (const line of cur.input) rows.push([t('vat.input'), cur.currency, rateText(line.rate), line.base, line.tax]);
        rows.push([t('vat.inputTotal'), cur.currency, '', cur.inputBase, cur.inputTax]);
        // Same wording as the screen and the PDF: positive is VAT to pay,
        // negative carries forward; the label carries the sign.
        const carries = cur.net.trim().startsWith('-');
        rows.push([t(carries ? 'vat.carryForward' : 'vat.payable'), cur.currency, '', '', carries ? cur.net.trim().slice(1) : cur.net]);
      }
      return [{
        name: t('export.sheet.vat'),
        columns: columns(locale, [
          ['export.col.section'], ['export.col.currency'], ['export.col.vatRate'],
          ['export.col.base', 'money'], ['export.col.vatAmount', 'money'],
        ]),
        rows,
      }];
    }
  }
}

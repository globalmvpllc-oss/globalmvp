import 'server-only';
import { prisma } from '@/lib/db';
import { translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { parseCalendarRange } from '@/lib/calendar-range';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { isQuoteStatus, quoteStatusBadge } from '@/lib/quote-status';
import {
  isChequeDirection,
  isChequeStatus,
  getChequeStatusBadge,
  CHEQUE_DIRECTION_LABEL_KEYS,
} from '@/lib/cheque-status';
import { bankTransactionWhere } from '@/lib/banking/transaction-filter';
import { effectiveStatus } from '@/lib/banking/reconciliation';
import { MATCH_INCLUDE } from '@/lib/banking/candidates';
import { vatPeriod } from '@/lib/vat-report';
import { loadVatReport } from '@/lib/vat-report-data';
import { loadReportsPayload } from '@/lib/reports-data';
import {
  LIST_PDF_MAX_ROWS,
  listContext,
  invoicesBody,
  quotesBody,
  recurringBody,
  customersBody,
  vendorsBody,
  expensesBody,
  incomeBody,
  paymentsBody,
  chequesBody,
  bankTransactionsBody,
  bankAccountsBody,
  vatBody,
  reportsBody,
  type ListBody,
  type ListPdfKind,
} from './list-pdf';

/**
 * Loads the rows behind a list or report PDF with the screen's own filter.
 *
 * Each case reads the same query parameters, with the same meaning, as the
 * list API that screen calls — so "Paid" on the invoice list gives a PDF of
 * the paid invoices and nothing else. The company always comes from the
 * session (the caller passes it); nothing in the query can select another
 * company's data.
 *
 * Unknown filter values are ignored, as the list APIs ignore them.
 */

export type ListLoadResult =
  | { ok: true; body: ListBody; filters: Array<{ label: string; value: string }>; truncatedAt: number | null }
  | { ok: false; status: number; error: string; code?: string };

const TAKE = LIST_PDF_MAX_ROWS + 1;

/** Drops the probe row and reports whether the query was cut off. */
function capped<T>(rows: T[]): { rows: T[]; truncatedAt: number | null } {
  return rows.length > LIST_PDF_MAX_ROWS
    ? { rows: rows.slice(0, LIST_PDF_MAX_ROWS), truncatedAt: LIST_PDF_MAX_ROWS }
    : { rows, truncatedAt: null };
}

export async function loadListDocument(
  kind: ListPdfKind,
  companyId: string,
  locale: Locale,
  searchParams: URLSearchParams
): Promise<ListLoadResult> {
  const ctx = listContext(locale);
  const t = (key: TranslationKey) => translate(locale, key);
  const filters: Array<{ label: string; value: string }> = [];

  /**
   * The from/to window the list APIs accept, or a 400 for a malformed date.
   * `to` is exclusive there, so the document names the day before it as the
   * last day of the period.
   */
  const range = () => {
    const parsed = parseCalendarRange(searchParams);
    if (parsed.error) return { error: parsed.error } as const;
    if (parsed.range) {
      const { gte, lt } = parsed.range;
      const last = lt ? new Date(lt.getTime() - 24 * 60 * 60 * 1000) : null;
      filters.push({ label: t('listPdf.period'), value: `${ctx.date(gte) || '…'} – ${ctx.date(last) || '…'}` });
    }
    return { range: parsed.range } as const;
  };

  const bad = (error: string): ListLoadResult => ({ ok: false, status: 400, error });

  switch (kind) {
    case 'invoices': {
      const status = searchParams.get('status');
      const r = range();
      if ('error' in r) return bad(String(r.error));
      const where: Record<string, unknown> = { companyId };
      if (status && status !== 'ALL') {
        where.status = status;
        filters.unshift({ label: t('export.col.status'), value: t(getStatusBadge(status).labelKey) });
      }
      if (r.range) where.dueDate = r.range;
      const result = capped(
        await prisma.invoice.findMany({
          where,
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: invoicesBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'quotes': {
      const status = searchParams.get('status');
      const where: Record<string, unknown> = { companyId };
      if (isQuoteStatus(status)) {
        where.status = status;
        filters.push({ label: t('export.col.status'), value: t(quoteStatusBadge(status).labelKey) });
      }
      const result = capped(
        await prisma.quote.findMany({
          where,
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: quotesBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'recurring': {
      const result = capped(
        await prisma.recurringInvoice.findMany({
          where: { companyId },
          include: { customer: { select: { name: true } }, items: { orderBy: { position: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: recurringBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'customers': {
      const result = capped(
        await prisma.customer.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: TAKE })
      );
      return { ok: true, body: customersBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'vendors': {
      const result = capped(
        await prisma.vendor.findMany({ where: { companyId }, orderBy: { name: 'asc' }, take: TAKE })
      );
      return { ok: true, body: vendorsBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'expenses': {
      const result = capped(
        await prisma.expenseTransaction.findMany({
          where: { companyId },
          include: { vendor: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: expensesBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'income': {
      const result = capped(
        await prisma.incomeTransaction.findMany({
          where: { companyId },
          include: { customer: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: incomeBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'payments': {
      const r = range();
      if ('error' in r) return bad(String(r.error));
      const result = capped(
        await prisma.payment.findMany({
          where: r.range ? { companyId, paymentDate: r.range } : { companyId },
          include: {
            invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
            expense: { select: { description: true, vendor: { select: { name: true } } } },
          },
          orderBy: { paymentDate: 'desc' },
          take: TAKE,
        })
      );
      return { ok: true, body: paymentsBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'cheques': {
      const direction = searchParams.get('direction');
      const status = searchParams.get('status');
      const r = range();
      if ('error' in r) return bad(String(r.error));
      const where: Record<string, unknown> = { companyId };
      if (isChequeDirection(direction)) {
        where.direction = direction;
        filters.unshift({ label: t('export.col.direction'), value: t(CHEQUE_DIRECTION_LABEL_KEYS[direction]) });
      }
      if (isChequeStatus(status)) {
        where.status = status;
        filters.push({ label: t('export.col.status'), value: t(getChequeStatusBadge(status).labelKey) });
      }
      if (r.range) where.dueDate = r.range;
      const result = capped(
        await prisma.chequeInstrument.findMany({
          where,
          include: { customer: { select: { name: true } }, vendor: { select: { name: true } } },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          take: TAKE,
        })
      );
      return { ok: true, body: chequesBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'bank-transactions': {
      const bankAccountId = searchParams.get('bankAccountId') || null;
      const status = searchParams.get('status');
      const search = searchParams.get('q')?.trim() ?? '';
      if (bankAccountId) {
        // Looked up inside the company: an id from elsewhere names nothing.
        const account = await prisma.bankAccount.findFirst({
          where: { id: bankAccountId, companyId },
          select: { bankName: true, accountName: true },
        });
        filters.push({
          label: t('listPdf.col.account'),
          value: account ? [account.bankName, account.accountName].filter(Boolean).join(' – ') : '—',
        });
      }
      const statusKeys: Record<string, TranslationKey> = {
        UNMATCHED: 'banking.toReconcile',
        MATCHED: 'banking.matched',
        IGNORED: 'banking.ignored',
      };
      if (status && statusKeys[status]) filters.push({ label: t('export.col.status'), value: t(statusKeys[status]) });
      if (search) filters.push({ label: t('listPdf.search'), value: search });

      const rows = await prisma.bankTransaction.findMany({
        where: bankTransactionWhere(companyId, { bankAccountId, status, search }),
        include: {
          bankAccount: { select: { bankName: true, accountName: true } },
          ...MATCH_INCLUDE,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: TAKE,
      });
      const result = capped(rows.map((row) => ({ ...row, effectiveStatus: effectiveStatus(row) })));
      return { ok: true, body: bankTransactionsBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'bank-accounts': {
      const result = capped(
        await prisma.bankAccount.findMany({
          where: { companyId },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
          take: TAKE,
        })
      );
      return { ok: true, body: bankAccountsBody(result.rows, ctx), filters, truncatedAt: result.truncatedAt };
    }

    case 'vat': {
      // Same period rule as the VAT screen and its export: the current month
      // when no dates are given.
      const period = vatPeriod(searchParams.get('from'), searchParams.get('to'));
      if (!period) return { ok: false, status: 400, error: 'Use dates such as 2026-11-01', code: 'BAD_PERIOD' };
      filters.push({ label: t('listPdf.period'), value: `${ctx.date(period.from)} – ${ctx.date(period.to)}` });
      const report = await loadVatReport(companyId, { gte: period.gte, lt: period.lt });
      return { ok: true, body: vatBody(report.currencies, ctx), filters, truncatedAt: null };
    }

    case 'reports': {
      const r = range();
      if ('error' in r) return bad(String(r.error));
      const [payload, company] = await Promise.all([
        loadReportsPayload(companyId, r.range),
        prisma.company.findUnique({ where: { id: companyId }, select: { defaultCurrency: true } }),
      ]);
      return { ok: true, body: reportsBody(payload, ctx, company?.defaultCurrency), filters, truncatedAt: null };
    }
  }
}

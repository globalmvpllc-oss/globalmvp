export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { buildReport, monthKeyOf } from '@/lib/reports-aggregate';
import { ISSUED_INVOICE_STATUSES } from '@/lib/invoice-status';

/**
 * Reports API — every figure summed by Postgres.
 *
 * The reports page used to fetch /api/income, /api/expenses and
 * /api/invoices?take=200 and reduce them in the browser. Those endpoints are
 * paginated, so a company past a page limit had its totals computed from a
 * partial list: the page carried a banner admitting the figures might be
 * incomplete. Aggregating here removes the possibility rather than warning
 * about it — no row is ever loaded to be added up.
 *
 * companyId comes from the session via `requireUserCompany`, never from the
 * query, so every aggregate below is scoped to the caller's own tenant.
 *
 * Like the other read endpoints (`income:GET`, `invoices:GET`) this does not
 * call `enforcePlanLimit`: plan limits gate what a company may create, not what
 * it may look at, and metering a read would lock a company out of its own
 * figures.
 *
 * ## Which dates are filtered
 *
 * `from`/`to` are parsed by `parseCalendarRange`, the same half-open,
 * UTC-pinned convention the list endpoints use. They are applied to:
 *
 *   income, expenses — `date`, the day the money moved. Not the calendar's
 *     `expectedPaymentDate ?? date`: that exists so the calendar can draw a
 *     record on the day it is expected, whereas a report is about what actually
 *     happened, and the monthly chart already buckets on `date`.
 *   invoices — `issueDate`, the day the invoice was raised. Not `dueDate`,
 *     which is what the calendar filters on, because "invoiced in August" means
 *     raised in August.
 *
 * Without either bound the behaviour matches what the page did before: every
 * record the company has.
 *
 * ## Which records count
 *
 *   income     RECEIVED only
 *   expenses   PAID only, for the totals and the monthly series
 *   invoices   issued only, for invoiced and collected
 *
 * The invoice line used to read "every status, drafts included", preserved
 * verbatim from the browser-side arithmetic this endpoint replaced so that no
 * figure would move during that refactor. It was wrong then and it moved a
 * figure now: a draft has never been issued to anybody, so counting one as
 * invoiced — and therefore as outstanding — reports money nobody owes. It now
 * reads `ISSUED_INVOICE_STATUSES`, the same definition the customer cards, the
 * account statement and the dashboard use.
 *
 * The invoice *status* pie below is deliberately left counting every status:
 * its whole job is to show how many invoices are sitting in draft, and
 * filtering them out would empty the slice that matters most.
 *
 * The expense-category pie keeps its own pre-existing behaviour of counting
 * every expense regardless of status; see the note at that query.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const dateFilter = range ? { date: range } : {};
    const issueFilter = range ? { issueDate: range } : {};

    const [
      company,
      incomeSums,
      expenseSums,
      categorySums,
      invoiceSums,
      invoiceStatuses,
      invoiceCount,
      incomeCount,
      expenseCount,
    ] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { defaultCurrency: true },
      }),

      // Income and expenses are grouped by (currency, date) rather than by
      // currency alone because the monthly chart needs the split. Postgres
      // returns one row per distinct day that has activity — an aggregate, not
      // the transactions — and the months are folded from those.
      prisma.incomeTransaction.groupBy({
        by: ['currency', 'date'],
        where: { companyId, status: 'RECEIVED', ...dateFilter },
        _sum: { amount: true },
      }),
      prisma.expenseTransaction.groupBy({
        by: ['currency', 'date'],
        where: { companyId, status: 'PAID', ...dateFilter },
        _sum: { amount: true },
      }),

      // The category pie counts expenses of every status, which is what it
      // counted when the page reduced the raw list in the browser. That makes
      // it disagree with the PAID-only "Total Expenses" card — a pre-existing
      // inconsistency, preserved here rather than silently redefined, since
      // changing it would move a number this task is not meant to move.
      prisma.expenseTransaction.groupBy({
        by: ['currency', 'category'],
        where: { companyId, ...dateFilter },
        _sum: { amount: true },
      }),

      // Money: issued invoices only. A draft is not a receivable.
      prisma.invoice.groupBy({
        by: ['currency'],
        where: { companyId, status: { in: [...ISSUED_INVOICE_STATUSES] }, ...issueFilter },
        _sum: { total: true, amountPaid: true },
      }),
      // Counts: every status, because "how many are still drafts?" is exactly
      // what this chart is for.
      prisma.invoice.groupBy({
        by: ['status'],
        where: { companyId, ...issueFilter },
        _count: { _all: true },
      }),

      // Existence checks, scoped only by company: unfiltered by status and by
      // date on purpose. They answer "has this business ever recorded
      // anything?", which is the question the page's empty state asks. Deriving
      // it from the filtered aggregates above would tell a company whose only
      // income is still EXPECTED that it has not entered anything yet. Same
      // reasoning as the dashboard route.
      prisma.invoice.count({ where: { companyId } }),
      prisma.incomeTransaction.count({ where: { companyId } }),
      prisma.expenseTransaction.count({ where: { companyId } }),
    ]);

    const payload = buildReport({
      income: incomeSums.map((row) => ({
        currency: row.currency,
        date: row.date,
        amount: row._sum.amount,
      })),
      expenses: expenseSums.map((row) => ({
        currency: row.currency,
        date: row.date,
        amount: row._sum.amount,
      })),
      expenseCategories: categorySums.map((row) => ({
        currency: row.currency,
        category: row.category,
        amount: row._sum.amount,
      })),
      invoices: invoiceSums.map((row) => ({
        currency: row.currency,
        total: row._sum.total,
        amountPaid: row._sum.amountPaid,
      })),
      invoiceStatuses: invoiceStatuses.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      hasRecords: invoiceCount > 0 || incomeCount > 0 || expenseCount > 0,
      defaultCurrency: company?.defaultCurrency ?? 'USD',
      // An explicit range fixes the chart's window, so a month the caller asked
      // for is drawn at zero rather than dropped for having no activity.
      window: range
        ? {
            startKey: range.gte ? monthKeyOf(range.gte) ?? undefined : undefined,
            // `to` is exclusive, so the last month included is the one holding
            // the instant just before it: a to=2026-09-01 request ends in August.
            endKey: range.lt
              ? monthKeyOf(new Date(range.lt.getTime() - 1)) ?? undefined
              : undefined,
          }
        : undefined,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError('reports:GET', error, { fallbackMessage: 'Failed to load reports' });
  }
}

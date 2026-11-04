import 'server-only';
import { prisma } from '@/lib/db';
import { buildReport, monthKeyOf, type ReportsPayload } from '@/lib/reports-aggregate';
import { ISSUED_INVOICE_STATUSES } from '@/lib/invoice-status';

/**
 * The figures behind the reports page, summed by Postgres.
 *
 * Moved here unchanged from `app/api/reports/route.ts` so the reports screen
 * and the report PDF are computed by one function and cannot disagree. The
 * notes on which dates are filtered and which records count stay on the
 * route, beside the API they describe.
 *
 * `companyId` must come from the session.
 */
export async function loadReportsPayload(
  companyId: string,
  range: { gte?: Date; lt?: Date } | null | undefined
): Promise<ReportsPayload> {
  const dateFilter = range ? { date: range } : {};
  const issueFilter = range ? { issueDate: range } : {};

  const [
    company,
    incomeSums,
    expenseSums,
    categorySums,
    unpaidSums,
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

    // The category pie: PAID, the same money the "Total Expenses" card counts
    // and the same window. The two therefore reconcile exactly — the slices
    // for a currency sum to that currency's total, which is the property a
    // reader will check by eye.
    prisma.expenseTransaction.groupBy({
      by: ['currency', 'category'],
      where: { companyId, status: 'PAID', ...dateFilter },
      _sum: { amount: true },
    }),

    // Recorded but unpaid, for the note beside the pie. Filtering the pie to
    // PAID is right for a page that reports what happened, but on its own it
    // would leave a company that records bills ahead of paying them unable to
    // see them here at all. This names the amount without adding it to
    // anything.
    prisma.expenseTransaction.groupBy({
      by: ['currency'],
      where: { companyId, status: 'UNPAID', ...dateFilter },
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
    unpaidExpenses: unpaidSums.map((row) => ({
      currency: row.currency,
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


  return payload;
}

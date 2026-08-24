export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import Decimal from 'decimal.js';

/**
 * Dashboard API — currency-safe aggregation.
 * Returns metrics grouped by currency so we never sum USD + EUR.
 */
export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const now = new Date();
    // `new Date(y, m + 1, 0)` yields the last day of the month at 00:00:00, so a
    // `lte` filter silently dropped everything recorded on that final day.
    // Use a half-open interval [startOfMonth, startOfNextMonth) instead.
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    // These seven reads are independent. Running them sequentially cost one
    // network round trip each, which dominates total latency when the database
    // is geographically distant.
    const [
      incomeGroups,
      invoicePayments,
      expenseGroups,
      outstandingInvoices,
      upcomingExpenses,
      upcomingInvoices,
      upcomingExpensesList,
    ] = await Promise.all([
      // Revenue by currency (received income this month)
      prisma.incomeTransaction.groupBy({
        by: ['currency'],
        where: { companyId, status: 'RECEIVED', date: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { amount: true },
      }),
      // Payments received against invoices this month
      prisma.payment.findMany({
        where: {
          companyId,
          invoiceId: { not: null },
          paymentDate: { gte: startOfMonth, lt: startOfNextMonth },
        },
        select: { amount: true, currency: true },
      }),
      // Expenses by currency (paid this month)
      prisma.expenseTransaction.groupBy({
        by: ['currency'],
        where: { companyId, status: 'PAID', date: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { amount: true },
      }),
      // Receivables by currency (outstanding invoices)
      prisma.invoice.findMany({
        where: { companyId, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        select: { total: true, amountPaid: true, currency: true },
      }),
      // Upcoming payments by currency (unpaid expenses)
      prisma.expenseTransaction.groupBy({
        by: ['currency'],
        where: { companyId, status: 'UNPAID' },
        _sum: { amount: true },
      }),
      // Activity feed: invoices due within 30 days
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
          dueDate: { lte: thirtyDaysOut },
        },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // Activity feed: expenses due within 30 days
      prisma.expenseTransaction.findMany({
        where: { companyId, status: 'UNPAID', dueDate: { not: null, lte: thirtyDaysOut } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);

    // Build byCurrency map
    const byCurrency: Record<string, { revenue: string; expenses: string; profit: string; receivables: string; upcomingPayments: string }> = {};

    const ensureCurrency = (c: string) => {
      if (!byCurrency[c]) byCurrency[c] = { revenue: '0', expenses: '0', profit: '0', receivables: '0', upcomingPayments: '0' };
    };

    // Income revenue
    for (const g of incomeGroups) {
      const cur = g.currency || 'USD';
      ensureCurrency(cur);
      byCurrency[cur].revenue = new Decimal(byCurrency[cur].revenue).plus(new Decimal(String(g._sum?.amount ?? 0))).toFixed(2);
    }

    // Invoice payment revenue
    for (const p of invoicePayments) {
      const cur = p.currency || 'USD';
      ensureCurrency(cur);
      byCurrency[cur].revenue = new Decimal(byCurrency[cur].revenue).plus(new Decimal(String(p.amount))).toFixed(2);
    }

    // Expenses
    for (const g of expenseGroups) {
      const cur = g.currency || 'USD';
      ensureCurrency(cur);
      byCurrency[cur].expenses = new Decimal(String(g._sum?.amount ?? 0)).toFixed(2);
    }

    // Receivables
    for (const inv of outstandingInvoices) {
      const cur = inv.currency || 'USD';
      ensureCurrency(cur);
      const remaining = new Decimal(String(inv.total)).minus(new Decimal(String(inv.amountPaid)));
      byCurrency[cur].receivables = new Decimal(byCurrency[cur].receivables).plus(remaining).toFixed(2);
    }

    // Upcoming payments
    for (const g of upcomingExpenses) {
      const cur = g.currency || 'USD';
      ensureCurrency(cur);
      byCurrency[cur].upcomingPayments = new Decimal(String(g._sum?.amount ?? 0)).toFixed(2);
    }

    // Compute profit per currency
    for (const cur of Object.keys(byCurrency)) {
      byCurrency[cur].profit = new Decimal(byCurrency[cur].revenue).minus(new Decimal(byCurrency[cur].expenses)).toFixed(2);
    }

    const activities: Array<{
      id: string;
      type: string;
      title: string;
      subtitle: string;
      amount: string;
      currency: string;
      date: Date | null;
    }> = [];

    for (const inv of upcomingInvoices) {
      const isOverdue = inv.dueDate && inv.dueDate < now;
      const remaining = new Decimal(String(inv.total)).minus(new Decimal(String(inv.amountPaid)));
      activities.push({
        id: inv.id,
        type: isOverdue ? 'overdue_invoice' : 'invoice_due',
        title: isOverdue
          ? `Invoice ${inv.invoiceNumber} is overdue`
          : `Invoice ${inv.invoiceNumber} due`,
        subtitle: inv.customer?.name ?? 'Unknown',
        amount: remaining.toFixed(2),
        currency: inv.currency,
        date: inv.dueDate,
      });
    }
    for (const exp of upcomingExpensesList) {
      activities.push({
        id: exp.id,
        type: 'expense_due',
        title: exp.description,
        subtitle: 'Expense due',
        amount: new Decimal(String(exp.amount)).toFixed(2),
        currency: exp.currency,
        date: exp.dueDate,
      });
    }
    activities.sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());

    return NextResponse.json({
      byCurrency,
      activities: activities.slice(0, 15),
    });
  } catch (error) {
    return handleApiError('dashboard:GET', error, { fallbackMessage: 'Failed to load dashboard' });
  }
}

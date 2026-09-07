export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { buildStatement, STATEMENT_MAX_ROWS } from '@/lib/statement-ledger';
import {
  customerMovements,
  reconcileStatement,
  STATEMENT_INVOICE_STATUSES,
  EXCLUDED_INVOICE_STATUSES,
  STATEMENT_INCOME_STATUS,
  type Reconciliation,
} from '@/lib/statement-sources';
import Decimal from 'decimal.js';

/**
 * Current account statement for one customer — the running ledger of what they
 * owe.
 *
 * companyId comes from the session via `requireUserCompany`, never from the
 * request, and the customer is looked up by `{ id, companyId }`: an id in the
 * URL is not authorisation. Every query below carries companyId as well, so a
 * row that changed hands between statements still cannot be read.
 *
 * Like the other read endpoints this does not call `enforcePlanLimit` — plan
 * limits gate what a company may create, not what it may look at.
 *
 * ## Why the rows are not date-filtered
 *
 * `from`/`to` narrow what is *drawn*, never what is *read*. The running balance
 * has to be accumulated over every movement on the account or the window would
 * open at zero and every figure in it would be wrong; the opening balance is
 * exactly the part of the account that sits before the window. So the ledger is
 * built from the complete set and `buildStatement` does the windowing.
 *
 * ## Reconciliation with the customer page
 *
 * The detail page shows `outstanding` = SUM(total) - SUM(amountPaid) over
 * invoices of every status. This ledger deliberately omits DRAFT and CANCELLED
 * invoices and deliberately includes uninvoiced EXPECTED income, so the two
 * figures can differ. The difference is computed here from aggregates — not
 * from the row list, so it cannot be thrown off by truncation — and returned
 * per currency, so the screen can explain the gap instead of contradicting the
 * card above it.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, companyId },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        taxId: true,
        defaultCurrency: true,
      },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ledgerStatuses = [...STATEMENT_INVOICE_STATUSES];
    const excludedStatuses = [...EXCLUDED_INVOICE_STATUSES];

    const [
      company,
      invoices,
      payments,
      income,
      invoiceSums,
      excludedSums,
      expectedSums,
    ] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { defaultCurrency: true } }),

      prisma.invoice.findMany({
        where: { companyId, customerId: customer.id, status: { in: ledgerStatuses } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          issueDate: true,
        },
        orderBy: { issueDate: 'asc' },
        take: STATEMENT_MAX_ROWS + 1,
      }),

      // Scoped through the invoice, so a payment recorded against a DRAFT or
      // CANCELLED invoice stays off the statement together with the invoice it
      // belongs to. A credit whose matching debit is not shown would read as an
      // unexplained reduction of the balance.
      prisma.payment.findMany({
        where: {
          companyId,
          invoice: { companyId, customerId: customer.id, status: { in: ledgerStatuses } },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { paymentDate: 'asc' },
        take: STATEMENT_MAX_ROWS + 1,
      }),

      prisma.incomeTransaction.findMany({
        where: { companyId, customerId: customer.id, status: STATEMENT_INCOME_STATUS },
        select: {
          id: true,
          description: true,
          status: true,
          currency: true,
          amount: true,
          date: true,
        },
        orderBy: { date: 'asc' },
        take: STATEMENT_MAX_ROWS + 1,
      }),

      // Aggregated by Postgres, so the reconciliation figures are never derived
      // from a truncated list even when the row queries above hit their cap.
      prisma.invoice.groupBy({
        by: ['currency'],
        where: { companyId, customerId: customer.id },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.invoice.groupBy({
        by: ['currency'],
        where: { companyId, customerId: customer.id, status: { in: excludedStatuses } },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.incomeTransaction.groupBy({
        by: ['currency'],
        where: { companyId, customerId: customer.id, status: STATEMENT_INCOME_STATUS },
        _sum: { amount: true },
      }),
    ]);

    const truncated =
      invoices.length > STATEMENT_MAX_ROWS ||
      payments.length > STATEMENT_MAX_ROWS ||
      income.length > STATEMENT_MAX_ROWS;

    const fallbackCurrency =
      customer.defaultCurrency || company?.defaultCurrency || 'USD';

    const statement = buildStatement({
      movements: customerMovements({
        invoices: invoices.slice(0, STATEMENT_MAX_ROWS),
        payments: payments.slice(0, STATEMENT_MAX_ROWS).map((row) => ({
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          paymentDate: row.paymentDate,
          paymentMethod: row.paymentMethod,
          reference: row.reference,
          documentLabel: row.invoice?.invoiceNumber ?? null,
        })),
        income: income.slice(0, STATEMENT_MAX_ROWS),
      }),
      defaultCurrency: fallbackCurrency,
      window: range,
    });

    const sumsByCurrency = (
      rows: Array<{ currency: string | null; value: Decimal }>
    ): Map<string, Decimal> => {
      const map = new Map<string, Decimal>();
      for (const row of rows) {
        const key = row.currency && row.currency.trim() !== '' ? row.currency : fallbackCurrency;
        map.set(key, (map.get(key) ?? new Decimal(0)).plus(row.value));
      }
      return map;
    };

    const net = (total: unknown, paid: unknown) =>
      new Decimal(String(total ?? 0)).minus(new Decimal(String(paid ?? 0)));

    const outstanding = sumsByCurrency(
      invoiceSums.map((row) => ({
        currency: row.currency,
        value: net(row._sum.total, row._sum.amountPaid),
      }))
    );
    const excluded = sumsByCurrency(
      excludedSums.map((row) => ({
        currency: row.currency,
        value: net(row._sum.total, row._sum.amountPaid),
      }))
    );
    const expected = sumsByCurrency(
      expectedSums.map((row) => ({
        currency: row.currency,
        value: new Decimal(String(row._sum.amount ?? 0)),
      }))
    );

    // Every currency that appears anywhere gets a reconciliation entry, so a
    // currency present only as a draft invoice is still explained rather than
    // silently absent.
    const currencies = new Set<string>([
      ...statement.currencies,
      ...outstanding.keys(),
      ...excluded.keys(),
      ...expected.keys(),
    ]);

    const reconciliation: Record<string, Reconciliation> = {};
    for (const currency of currencies) {
      reconciliation[currency] = reconcileStatement({
        outstanding: outstanding.get(currency) ?? new Decimal(0),
        statementBalance: statement.byCurrency[currency]?.accountBalance ?? '0.00',
        excludedInvoices: excluded.get(currency) ?? new Decimal(0),
        uninvoicedReceivables: expected.get(currency) ?? new Decimal(0),
      });
    }

    return NextResponse.json({
      party: {
        kind: 'customer',
        id: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        postalCode: customer.postalCode,
        country: customer.country,
        taxId: customer.taxId,
      },
      ...statement,
      reconciliation,
      truncated,
    });
  } catch (error) {
    return handleApiError('customers:GET:statement', error, {
      fallbackMessage: 'Failed to load the account statement',
    });
  }
}

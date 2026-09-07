export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { buildStatement, STATEMENT_MAX_ROWS } from '@/lib/statement-ledger';
import { vendorMovements } from '@/lib/statement-sources';

/**
 * Current account statement for one vendor — the running ledger of what you owe
 * them.
 *
 * The mirror of the customer statement, with the sign convention reversed:
 * expenses debit and payments made credit, so a positive balance is a payable.
 *
 * companyId comes from the session; the vendor is looked up by
 * `{ id, companyId }` and every query below carries companyId, so a vendor id
 * in the URL grants nothing on its own.
 *
 * As on the customer side, `from`/`to` narrow what is drawn and never what is
 * read: the running balance is accumulated over the whole account and only then
 * windowed, which is what makes the opening balance correct.
 *
 * Unlike the customer statement there is no reconciliation block. That block
 * exists to explain a difference against a figure another screen already shows;
 * no vendor totals screen exists today, so this ledger is the only statement of
 * the balance and has nothing to disagree with. If a vendor summary card is
 * added later it should be derived from here rather than computed a second way.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const vendor = await prisma.vendor.findFirst({
      where: { id: params.id, companyId },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        country: true,
        taxId: true,
      },
    });
    if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [company, expenses, payments] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { defaultCurrency: true } }),

      prisma.expenseTransaction.findMany({
        where: { companyId, vendorId: vendor.id },
        select: {
          id: true,
          description: true,
          category: true,
          status: true,
          currency: true,
          amount: true,
          date: true,
        },
        orderBy: { date: 'asc' },
        take: STATEMENT_MAX_ROWS + 1,
      }),

      // Payment carries no vendorId of its own — it reaches a vendor through
      // the expense it was recorded against — so the scope goes through the
      // expense, which also keeps the company check on both rows.
      prisma.payment.findMany({
        where: { companyId, expense: { companyId, vendorId: vendor.id } },
        select: {
          id: true,
          expenseId: true,
          amount: true,
          currency: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          expense: { select: { description: true } },
        },
        orderBy: { paymentDate: 'asc' },
        take: STATEMENT_MAX_ROWS + 1,
      }),
    ]);

    const truncated =
      expenses.length > STATEMENT_MAX_ROWS || payments.length > STATEMENT_MAX_ROWS;

    const statement = buildStatement({
      movements: vendorMovements({
        expenses: expenses.slice(0, STATEMENT_MAX_ROWS),
        payments: payments.slice(0, STATEMENT_MAX_ROWS).map((row) => ({
          id: row.id,
          expenseId: row.expenseId,
          amount: row.amount,
          currency: row.currency,
          paymentDate: row.paymentDate,
          paymentMethod: row.paymentMethod,
          reference: row.reference,
          documentLabel: row.expense?.description ?? null,
        })),
      }),
      defaultCurrency: company?.defaultCurrency ?? 'USD',
      window: range,
    });

    return NextResponse.json({
      party: {
        kind: 'vendor',
        id: vendor.id,
        name: vendor.name,
        companyName: vendor.companyName,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        city: null,
        state: null,
        postalCode: null,
        country: vendor.country,
        taxId: vendor.taxId,
      },
      ...statement,
      reconciliation: {},
      truncated,
    });
  } catch (error) {
    return handleApiError('vendors:GET:statement', error, {
      fallbackMessage: 'Failed to load the account statement',
    });
  }
}

import 'server-only';
import { prisma } from '@/lib/db';
import { ISSUED_INVOICE_STATUSES } from '@/lib/invoice-status';
import { buildVatReport } from '@/lib/vat-report';

/**
 * Loads the VAT report for one company and one period. Used by the report
 * screen and by the Excel/CSV export, so both show the same figures.
 */
export async function loadVatReport(companyId: string, period: { gte: Date; lt: Date }) {
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, status: { in: [...ISSUED_INVOICE_STATUSES] }, issueDate: { gte: period.gte, lt: period.lt } },
      select: {
        currency: true,
        items: { select: { quantity: true, unitPrice: true, discount: true, taxRate: true } },
      },
      take: 20000,
    }),
    prisma.expenseTransaction.findMany({
      where: {
        companyId,
        date: { gte: period.gte, lt: period.lt },
        OR: [{ taxAmount: { not: null } }, { taxRate: { not: null } }],
      },
      select: { currency: true, amount: true, taxRate: true, taxAmount: true },
      take: 20000,
    }),
  ]);
  return {
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
    currencies: buildVatReport({ invoices, expenses }),
  };
}

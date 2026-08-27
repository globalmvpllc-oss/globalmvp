import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { formatCurrency } from '@/lib/currencies';
import { AdminBackLink, DetailCard, FieldGrid, Field, DetailTable } from '@/components/admin-detail';

/**
 * A single invoice, read-only. The panel displays the figures the invoicing
 * code already stored; it never recalculates or edits a total from here.
 */
export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AdminInvoiceDetailPage({ params }: { params: { id: string } }) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      subtotal: true,
      taxTotal: true,
      discountTotal: true,
      total: true,
      amountPaid: true,
      issueDate: true,
      dueDate: true,
      notes: true,
      company: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, companyName: true, email: true } },
      items: { select: { id: true, description: true, quantity: true, unitPrice: true, taxRate: true, amount: true } },
      payments: {
        select: { id: true, amount: true, currency: true, paymentDate: true, paymentMethod: true },
        orderBy: { paymentDate: 'desc' },
      },
    },
  });

  if (!invoice) notFound();

  const cur = invoice.currency;

  return (
    <div className="space-y-4">
      <AdminBackLink href="/admin/invoices" label="Back to invoices" />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
        <p className="text-muted-foreground">{invoice.status}</p>
      </div>

      <DetailCard title="Overview">
        <FieldGrid>
          <Field
            label="Company"
            value={
              <Link href={`/admin/companies/${invoice.company?.id}`} className="text-primary hover:underline">
                {invoice.company?.name ?? '—'}
              </Link>
            }
          />
          <Field label="Customer" value={invoice.customer?.name || invoice.customer?.companyName} />
          <Field label="Customer email" value={invoice.customer?.email} />
          <Field label="Status" value={invoice.status} />
          <Field label="Issued" value={day(invoice.issueDate)} mono />
          <Field label="Due" value={day(invoice.dueDate)} mono />
          <Field label="Subtotal" value={formatCurrency(Number(invoice.subtotal), cur)} mono />
          <Field label="Discount" value={formatCurrency(Number(invoice.discountTotal), cur)} mono />
          <Field label="Tax" value={formatCurrency(Number(invoice.taxTotal), cur)} mono />
          <Field label="Total" value={formatCurrency(Number(invoice.total), cur)} mono />
          <Field label="Paid" value={formatCurrency(Number(invoice.amountPaid), cur)} mono />
          <Field
            label="Outstanding"
            value={formatCurrency(Number(invoice.total) - Number(invoice.amountPaid), cur)}
            mono
          />
        </FieldGrid>
        {invoice.notes ? <p className="mt-3 text-sm text-muted-foreground">{invoice.notes}</p> : null}
      </DetailCard>

      <DetailCard title={`Line items (${invoice.items.length})`}>
        <DetailTable
          rows={invoice.items as any[]}
          emptyMessage="No line items."
          columns={[
            { key: 'desc', header: 'Description', cell: (it: any) => it.description },
            { key: 'qty', header: 'Qty', className: 'font-mono text-xs', cell: (it: any) => String(it.quantity) },
            { key: 'price', header: 'Unit', className: 'font-mono', cell: (it: any) => formatCurrency(Number(it.unitPrice), cur) },
            { key: 'tax', header: 'Tax %', className: 'font-mono text-xs', cell: (it: any) => String(it.taxRate) },
            { key: 'amount', header: 'Amount', className: 'font-mono', cell: (it: any) => formatCurrency(Number(it.amount), cur) },
          ]}
        />
      </DetailCard>

      <DetailCard title={`Payments (${invoice.payments.length})`}>
        <DetailTable
          rows={invoice.payments as any[]}
          emptyMessage="No payments recorded against this invoice."
          columns={[
            {
              key: 'ref',
              header: 'Payment',
              cell: (p: any) => (
                <Link href={`/admin/payments/${p.id}`} className="text-primary hover:underline">
                  {formatCurrency(Number(p.amount), p.currency)}
                </Link>
              ),
            },
            { key: 'method', header: 'Method', cell: (p: any) => p.paymentMethod ?? '—' },
            { key: 'date', header: 'Date', className: 'font-mono text-xs', cell: (p: any) => day(p.paymentDate) },
          ]}
        />
      </DetailCard>
    </div>
  );
}

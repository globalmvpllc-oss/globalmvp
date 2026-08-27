import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { formatCurrency } from '@/lib/currencies';
import { AdminBackLink, DetailCard, FieldGrid, Field } from '@/components/admin-detail';

/**
 * A single payment, read-only. Shows what it was recorded against — an invoice
 * or an expense — and the company it belongs to.
 */
export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AdminPaymentDetailPage({ params }: { params: { id: string } }) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentDate: true,
      paymentMethod: true,
      reference: true,
      notes: true,
      createdAt: true,
      company: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } },
      expense: { select: { id: true, description: true } },
    },
  });

  if (!payment) notFound();

  return (
    <div className="space-y-4">
      <AdminBackLink href="/admin/payments" label="Back to payments" />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {formatCurrency(Number(payment.amount), payment.currency)}
        </h1>
        <p className="text-muted-foreground">
          {payment.invoice
            ? `Invoice payment · ${payment.invoice.invoiceNumber}`
            : payment.expense
              ? `Expense payment · ${payment.expense.description}`
              : 'Payment'}
        </p>
      </div>

      <DetailCard title="Overview">
        <FieldGrid>
          <Field
            label="Company"
            value={
              <Link href={`/admin/companies/${payment.company?.id}`} className="text-primary hover:underline">
                {payment.company?.name ?? '—'}
              </Link>
            }
          />
          <Field label="Amount" value={formatCurrency(Number(payment.amount), payment.currency)} mono />
          <Field label="Method" value={payment.paymentMethod} />
          <Field label="Date" value={day(payment.paymentDate)} mono />
          <Field
            label="Against invoice"
            value={
              payment.invoice ? (
                <Link href={`/admin/invoices/${payment.invoice.id}`} className="text-primary hover:underline">
                  {payment.invoice.invoiceNumber}
                </Link>
              ) : null
            }
          />
          <Field label="Against expense" value={payment.expense?.description} />
          <Field label="Customer" value={payment.invoice?.customer?.name} />
          <Field label="Reference" value={payment.reference} />
          <Field label="Recorded" value={day(payment.createdAt)} mono />
        </FieldGrid>
        {payment.notes ? <p className="mt-3 text-sm text-muted-foreground">{payment.notes}</p> : null}
      </DetailCard>
    </div>
  );
}

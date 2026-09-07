'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Mail, Phone, MapPin, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { isIssuedInvoice } from '@/lib/invoice-status';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { readErrorMessage } from '@/lib/api-feedback';
import { countryLabel } from '@/lib/countries';
import { formatCalendarDate } from '@/lib/calendar-date';
import { AccountStatement } from '@/components/account-statement';
import { useI18n } from '@/components/i18n-provider';

export default function CustomerDetailPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    // A 404/401 must not render as an empty customer: the response body for a
    // failure is `{ error: ... }`, which is truthy, so setting it here would
    // show blank fields and zero totals instead of the "not found" state.
    // Leaving `customer` null on a non-OK response keeps that state honest.
    fetch(`/api/customers/${params?.id}`)
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!active) return;
        setCustomer(d);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params?.id]);

  const handleDelete = async () => {
    // A customer that still has invoices cannot be deleted: the API refuses it
    // with 409 to protect the invoice history. The confirmation says exactly
    // that, rather than promising to remove invoices — which is the opposite of
    // what the backend does.
    if (!confirm(t('customers.deleteConfirm'))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${params?.id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Never report success on a refused delete: on 409 the customer is still
        // there, so show the real reason and stay on the page.
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(t('customers.deleted'));
      router.push('/customers');
    } catch {
      toast.error(t('error.network'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">{t('common.loading')}</div></div>;
  if (!customer) return <div className="text-center py-12">{t('customers.notFound')}</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('customers.backAria')} onClick={() => router.push('/customers')}><ArrowLeft className="w-4 h-4" /></Button>
        {/* min-w-0 lets a long business name truncate instead of pushing the
            delete button off the side of the screen. */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-display font-bold tracking-tight truncate">{customer?.name ?? ''}</h1>
          {customer?.companyName && <p className="text-muted-foreground truncate">{customer.companyName}</p>}
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('common.delete')} onClick={handleDelete} disabled={deleting}><Trash2 className="w-4 h-4 text-red-500" /></Button>
      </div>

      {/* Stats — grouped per currency. A customer invoiced in more than one
          currency would otherwise show a single bucket under one (possibly
          wrong) currency label; the API exposes `byCurrency` for exactly this. */}
      {(() => {
        const buckets: Record<string, { totalInvoiced: string; totalPaid: string; outstanding: string }> =
          customer?.byCurrency ?? {};
        const codes = Object.keys(buckets);
        // No invoices yet: one zeroed row in the summary currency.
        if (codes.length === 0) {
          const cur = customer?.summaryCurrency ?? customer?.defaultCurrency ?? 'USD';
          return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.totalInvoiced')}</p><p className="text-lg font-mono font-bold">{formatCurrency(0, cur)}</p></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.totalPaid')}</p><p className="text-lg font-mono font-bold text-green-600">{formatCurrency(0, cur)}</p></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.outstanding')}</p><p className="text-lg font-mono font-bold text-amber-600">{formatCurrency(0, cur)}</p></CardContent></Card>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            {codes.map((cur) => {
              const b = buckets[cur];
              return (
                <div key={cur}>
                  {codes.length > 1 && (
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{cur}</h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.totalInvoiced')}</p><p className="text-lg font-mono font-bold">{formatCurrency(b.totalInvoiced, cur)}</p></CardContent></Card>
                    <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.totalPaid')}</p><p className="text-lg font-mono font-bold text-green-600">{formatCurrency(b.totalPaid, cur)}</p></CardContent></Card>
                    <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">{t('customers.outstanding')}</p><p className="text-lg font-mono font-bold text-amber-600">{formatCurrency(b.outstanding, cur)}</p></CardContent></Card>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Contact Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('vendors.contact')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {customer?.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span suppressHydrationWarning>{customer.email}</span></div>}
            {customer?.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span suppressHydrationWarning>{customer.phone}</span></div>}
            {customer?.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{customer.address}{customer?.city ? `, ${customer.city}` : ''}{customer?.country ? `, ${countryLabel(customer.country)}` : ''}</span></div>}
            {customer?.taxId && <div><span className="text-muted-foreground">{t('vendors.taxId')}: </span>{customer.taxId}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('customers.invoiceHistory')}</CardTitle></CardHeader>
        <CardContent>
          {(customer?.invoices?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('reports.noInvoices')}</p>
          ) : (
            <div className="space-y-2">
              {/* Said once, above the rows, rather than repeated on each one. */}
              {(customer?.invoices ?? []).some((inv: any) => !isIssuedInvoice(inv?.status)) && (
                <p className="pb-1 text-xs text-muted-foreground">{t('customers.notCountedNote')}</p>
              )}
              {(customer?.invoices ?? []).map((inv: any) => {
                const si = getStatusBadge(inv?.status ?? 'DRAFT');
                /**
                 * Whether this row is part of the figures above.
                 *
                 * Drafts and cancelled invoices stay in the list — finding a
                 * draft and finishing it is what the list is for — but they are
                 * not money owed, so their amount is dimmed rather than set in
                 * the same weight as a real one. Without that, a reader adding
                 * the column up by eye would not arrive at the Total Invoiced
                 * card and would have no idea why.
                 */
                const counted = isIssuedInvoice(inv?.status);
                return (
                  <Link key={inv?.id} href={`/invoices/${inv?.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{inv?.invoiceNumber ?? ''}</p>
                        <p className="text-xs text-muted-foreground">{inv?.dueDate ? formatCalendarDate(inv.dueDate) : ''}</p>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                      <span
                        className={`font-mono text-sm ${counted ? '' : 'text-muted-foreground/70 line-through decoration-1'}`}
                        title={counted ? undefined : t('customers.notCounted')}
                      >
                        {formatCurrency(inv?.total ?? 0, inv?.currency ?? 'USD')}
                      </span>
                      <Badge className={si?.color ?? ''}>{t(si.labelKey)}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Running account ledger. Added below the existing cards rather than in
          place of them: the three totals answer where the account stands, the
          statement answers how it got there, and a business needs both. */}
      <AccountStatement
        endpoint={`/api/customers/${params?.id}/statement`}
        kind="customer"
        fileNameBase={`statement-${customer?.name ?? 'customer'}`}
      />
    </div>
  );
}

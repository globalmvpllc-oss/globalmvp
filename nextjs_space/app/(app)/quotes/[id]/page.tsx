'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Mail, FileCheck2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import { formatCurrency } from '@/lib/currencies';
import { formatCalendarDate } from '@/lib/calendar-date';
import { canConvertQuote, canTransitionQuote, quoteStatusBadge } from '@/lib/quote-status';
import { readErrorMessage } from '@/lib/api-feedback';
import { downloadBytes } from '@/lib/bulk-pdf';
import { DocumentLines } from '@/components/document-lines';
import { CanEdit, useReadOnly } from '@/components/read-only';

const EMAIL_ERRORS: Record<string, 'invoices.emailNoAddress' | 'invoices.emailPdfFailed' | 'invoices.emailNotConfigured' | 'invoices.emailTooMany' | 'invoices.emailFailed'> = {
  NO_EMAIL: 'invoices.emailNoAddress',
  PDF_FAILED: 'invoices.emailPdfFailed',
  NOT_CONFIGURED: 'invoices.emailNotConfigured',
  RATE_LIMITED: 'invoices.emailTooMany',
  SEND_FAILED: 'invoices.emailFailed',
};

/**
 * A quote. The one next step is the big button: send it while it is a draft,
 * turn it into an invoice once the customer has said yes.
 */
export default function QuoteDetailPage() {
  const { t, fill, locale, intl } = useI18n();
  const readOnly = useReadOnly();
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/quotes/${params?.id}`);
    setQuote(res.ok ? await res.json() : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [params?.id]);

  const money = (n: unknown) => formatCurrency(Number(n ?? 0), quote?.currency ?? 'USD');

  const sendEmail = async () => {
    const email = quote?.customer?.email;
    if (!email) { toast.error(t('invoices.emailNoAddress')); return; }
    if (!window.confirm(fill('quotes.emailConfirm', { number: quote.quoteNumber, email }))) return;
    setBusy('send');
    try {
      const res = await fetch(`/api/quotes/${quote.id}/send`, { method: 'POST' });
      if (res.ok) { toast.success(fill('invoices.emailSent', { email })); await load(); return; }
      const body = await res.json().catch(() => null);
      const key = typeof body?.code === 'string' ? EMAIL_ERRORS[body.code] : undefined;
      toast.error(key ? t(key) : t('invoices.emailFailed'));
    } catch { toast.error(t('error.network')); } finally { setBusy(null); }
  };

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf`);
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      downloadBytes(new Uint8Array(await res.arrayBuffer()), `${String(quote.quoteNumber).replace(/[^\w.-]+/g, '_')}.pdf`);
    } catch { toast.error(t('error.network')); } finally { setBusy(null); }
  };

  const setStatus = async (status: string) => {
    setBusy(status);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      setQuote(await res.json());
      toast.success(t('quotes.statusSaved'));
    } catch { toast.error(t('error.network')); } finally { setBusy(null); }
  };

  const convert = async () => {
    if (!window.confirm(t('quotes.convertConfirm'))) return;
    setBusy('convert');
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (res.ok || body?.code === 'ALREADY_CONVERTED') {
        if (body?.invoiceId) {
          toast.success(t('quotes.converted'));
          router.push(`/invoices/${body.invoiceId}`);
          return;
        }
      }
      toast.error(typeof body?.error === 'string' ? body.error : t('quotes.convertFailed'));
    } catch { toast.error(t('error.network')); } finally { setBusy(null); }
  };

  const remove = async () => {
    if (!window.confirm(t('quotes.deleteConfirm'))) return;
    const res = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
    toast.success(t('quotes.deleted'));
    router.push('/quotes');
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><div className="animate-pulse text-muted-foreground">{t('common.loading')}</div></div>;
  if (!quote) return <div className="py-12 text-center text-base">{t('quotes.notFound')}</div>;

  const badge = quoteStatusBadge(quote.status);
  const convertible = canConvertQuote(quote);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button variant="ghost" size="icon" aria-label={t('quotes.back')} onClick={() => router.push('/quotes')}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('quotes.one')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-display font-bold tracking-tight">{quote.quoteNumber}</h1>
              <Badge className={badge.color}>{t(badge.labelKey)}</Badge>
            </div>
            <p className="truncate text-base text-muted-foreground">{quote.customer?.name ?? ''}</p>
          </div>
        </div>
      </div>

      {/* The one clear next step. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base">
            {quote.convertedInvoice
              ? t('quotes.nextConverted')
              : quote.status === 'DRAFT'
                ? t('quotes.nextSend')
                : convertible
                  ? t('quotes.nextConvert')
                  : t('quotes.nextNone')}
          </p>
          {quote.convertedInvoice ? (
            <Button asChild size="lg"><Link href={`/invoices/${quote.convertedInvoice.id}`}><FileCheck2 className="mr-2 h-4 w-4" /> {fill('quotes.openInvoice', { number: quote.convertedInvoice.invoiceNumber })}</Link></Button>
          ) : readOnly ? null : quote.status === 'DRAFT' ? (
            <Button size="lg" onClick={sendEmail} disabled={busy !== null}><Mail className="mr-2 h-4 w-4" /> {busy === 'send' ? t('invoices.emailSending') : t('invoices.emailSend')}</Button>
          ) : convertible ? (
            <Button size="lg" onClick={convert} disabled={busy !== null}><FileCheck2 className="mr-2 h-4 w-4" /> {t('quotes.convert')}</Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={downloadPdf} disabled={busy !== null}><Download className="mr-2 h-4 w-4" /> {busy === 'pdf' ? t('invoices.generating') : t('listPdf.download')}</Button>
        <CanEdit>
        {quote.status !== 'DRAFT' && quote.status !== 'REJECTED' && !quote.convertedInvoice && (
          <Button variant="outline" onClick={sendEmail} disabled={busy !== null}><Mail className="mr-2 h-4 w-4" /> {t('quotes.resend')}</Button>
        )}
        {quote.status === 'DRAFT' && convertible && (
          <Button variant="outline" onClick={convert} disabled={busy !== null}><FileCheck2 className="mr-2 h-4 w-4" /> {t('quotes.convert')}</Button>
        )}
        {canTransitionQuote(quote.status, 'ACCEPTED') && !quote.convertedInvoice && (
          <Button variant="outline" onClick={() => setStatus('ACCEPTED')} disabled={busy !== null}><CheckCircle className="mr-2 h-4 w-4" /> {t('quotes.markAccepted')}</Button>
        )}
        {canTransitionQuote(quote.status, 'REJECTED') && !quote.convertedInvoice && (
          <Button variant="outline" onClick={() => setStatus('REJECTED')} disabled={busy !== null}><XCircle className="mr-2 h-4 w-4" /> {t('quotes.markRejected')}</Button>
        )}
        {!quote.convertedInvoice && (
          <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={remove}><Trash2 className="h-4 w-4 text-red-500" /></Button>
        )}
        </CanEdit>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="pb-3 pt-4"><p className="text-sm text-muted-foreground">{t('quotes.issueDate')}</p><p className="font-medium">{formatCalendarDate(quote.issueDate, 'MMM d, yyyy', intl)}</p></CardContent></Card>
        <Card><CardContent className="pb-3 pt-4"><p className="text-sm text-muted-foreground">{t('quotes.validUntil')}</p><p className="font-medium">{formatCalendarDate(quote.validUntil, 'MMM d, yyyy', intl)}</p></CardContent></Card>
        <Card><CardContent className="pb-3 pt-4"><p className="text-sm text-muted-foreground">{t('invoices.tax')}</p><p className="font-mono font-medium">{money(quote.taxTotal)}</p></CardContent></Card>
        <Card><CardContent className="pb-3 pt-4"><p className="text-sm text-muted-foreground">{t('common.total')}</p><p className="font-mono font-medium">{money(quote.total)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t('invoices.items')}</CardTitle></CardHeader>
        <CardContent>
          <DocumentLines doc={quote} currency={quote.currency ?? 'USD'} />
        </CardContent>
      </Card>

      {quote.notes && (
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t('common.notes')}</p><p className="mt-1 text-base">{quote.notes}</p></CardContent></Card>
      )}
    </div>
  );
}

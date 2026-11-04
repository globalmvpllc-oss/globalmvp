'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, CheckCircle, Download, Printer, CreditCard, Trash2, Copy, Mail } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { PAYMENT_METHODS, paymentMethodLabelKey } from '@/lib/validation';
import { useI18n } from '@/components/i18n-provider';
import { getChequeStatusBadge, CHEQUE_INSTRUMENT_LABEL_KEYS } from '@/lib/cheque-status';
import { resolveStoredFileUrl } from '@/lib/company-identity';
import { generateInvoiceHtml } from '@/lib/invoice-html';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { formatCalendarDate } from '@/lib/calendar-date';
import { readErrorMessage } from '@/lib/api-feedback';
import { downloadBytes } from '@/lib/bulk-pdf';
import { DocumentLines } from '@/components/document-lines';
import { isProformaInvoice } from '@/lib/tr-tax';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const { t, fill, locale, intl } = useI18n();
  const params = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'bank_transfer', reference: '', notes: '' });

  const fetchInvoice = async () => {
    const [invRes, compRes] = await Promise.all([
      fetch(`/api/invoices/${params?.id}`),
      fetch('/api/company'),
    ]);
    if (invRes.ok) { setInvoice(await invRes.json()); }
    if (compRes.ok) { setCompany(await compRes.json()); }
    setLoading(false);
  };

  useEffect(() => { fetchInvoice(); }, [params?.id]);

  /**
    * Moves the invoice to a new status.
    *
    * `PAID` is not a label change: the API records a payment for whatever is
    * outstanding, in the same transaction. Money must not move from a single
    * unconfirmed click, so the amount is named and confirmed first.
    */
  const updateStatus = async (status: string) => {
    if (status === 'PAID') {
      const outstandingNow = (Number(invoice?.total) || 0) - (Number(invoice?.amountPaid) || 0);
      const confirmed = window.confirm(
        fill('invoices.markPaidConfirm', {
          amount: formatCurrency(outstandingNow, invoice?.currency ?? 'USD'),
        })
      );
      if (!confirmed) return;
    }
    try {
      const res = await fetch(`/api/invoices/${params?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // A rejected transition (409/400) must not read as success: the badge and
      // the stored status would then disagree.
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      // The badge label for the new status, translated. Spelling out the stored
      // value would print "partially paid" inside a Turkish sentence.
      toast.success(
        status === 'PAID'
          ? t('invoices.markPaidRecorded')
          : fill('invoices.statusChanged', { status: t(getStatusBadge(status).labelKey) })
      );
      fetchInvoice();
    } catch {
      toast.error(t('error.network'));
    }
  };

  const recordPayment = async () => {
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) { toast.error(t('invoices.enterValidAmount')); return; }
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: params?.id,
          amount,
          currency: invoice?.currency ?? 'USD',
          paymentMethod: paymentForm.paymentMethod,
          reference: paymentForm.reference,
          notes: paymentForm.notes,
        }),
      });
      // A refused payment (overpayment, currency mismatch, cancelled invoice)
      // must never claim success: the invoice balance on screen would then
      // disagree with the database.
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(t('invoices.paymentRecorded'));
      setPaymentOpen(false);
      setPaymentForm({ amount: '', paymentMethod: 'bank_transfer', reference: '', notes: '' });
      fetchInvoice();
    } catch {
      toast.error(t('error.network'));
    }
  };

  /**
   * Inlines the company logo as a data URL.
   *
   * The stored logo is a private object reached through a signed URL. The PDF
   * renderer is a separate service that would not be able to follow that URL,
   * so the image is embedded in the document instead. Failure is non-fatal: the
   * invoice simply renders without a logo.
   */
  const loadLogoDataUrl = async (): Promise<string | null> => {
    // Already inline: nothing to fetch or convert.
    if (typeof company?.logoUrl === 'string' && company.logoUrl.startsWith('data:')) {
      return company.logoUrl;
    }
    const signed = await resolveStoredFileUrl(company?.logoUrl);
    if (!signed) return null;
    try {
      const res = await fetch(signed);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size > 1_500_000) return null; // keep the payload reasonable
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  /**
   * Opens the invoice in a print window so the browser can produce the PDF.
   *
   * The service-backed path is better (server-rendered, consistent margins),
   * but it depends on a third-party key. Without a fallback, an unset or
   * unreachable service means a bookkeeping product cannot produce an invoice
   * at all — so printing is always available, and is used automatically when
   * the service is not configured.
   *
   * The same generateInvoiceHtml output is used, so the template, the escaping
   * and the figures are identical to the downloaded file.
   */
  const printInvoice = async () => {
    const logoDataUrl = await loadLogoDataUrl();
    const html = generateInvoiceHtml(invoice, company, logoDataUrl);
    const win = window.open('', '_blank');
    if (!win) {
      toast.error(t('statement.pdfPopupBlocked'));
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    // Waits for the document — images especially — before opening the dialog,
    // otherwise the logo is missing from the printed page.
    win.onload = () => win.print();
    // onload does not fire for an already-complete document in every browser.
    if (win.document.readyState === 'complete') win.print();
  };

  /**
   * Downloads the PDF the server builds from the stored invoice (in-house
   * engine, no external service). A refusal keeps the API's own message —
   * including the plan's monthly PDF limit.
   */
  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/invoices/${params?.id}/pdf`);
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      downloadBytes(bytes, `${String(invoice?.invoiceNumber ?? 'invoice').replace(/[^w.-]+/g, '_')}.pdf`);
      toast.success(t('invoices.pdfDownloaded'));
    } catch {
      toast.error(t('invoices.pdfNotPrepared'));
    } finally {
      setPdfLoading(false);
    }
  };

  /**
   * Emails the invoice to the customer's stored address with the PDF
   * attached. The server builds the PDF itself and refuses to send without it.
   */
  const EMAIL_ERROR_KEYS: Record<string, 'invoices.emailNoAddress' | 'invoices.emailPdfFailed' | 'invoices.emailNotConfigured' | 'invoices.emailCancelled' | 'invoices.emailTooMany' | 'invoices.emailFailed'> = {
    NO_EMAIL: 'invoices.emailNoAddress',
    PDF_FAILED: 'invoices.emailPdfFailed',
    NOT_CONFIGURED: 'invoices.emailNotConfigured',
    CANCELLED: 'invoices.emailCancelled',
    RATE_LIMITED: 'invoices.emailTooMany',
    SEND_FAILED: 'invoices.emailFailed',
  };

  const sendByEmail = async () => {
    const email = invoice?.customer?.email;
    if (!email) {
      toast.error(t('invoices.emailNoAddress'));
      return;
    }
    if (!window.confirm(fill('invoices.emailConfirm', { number: invoice?.invoiceNumber ?? '', email }))) return;
    setEmailSending(true);
    try {
      const res = await fetch(`/api/invoices/${params?.id}/send`, { method: 'POST' });
      if (res.ok) {
        toast.success(fill('invoices.emailSent', { email }));
        fetchInvoice();
        return;
      }
      const body = await res.json().catch(() => null);
      const key = typeof body?.code === 'string' ? EMAIL_ERROR_KEYS[body.code] : undefined;
      toast.error(key ? t(key) : typeof body?.error === 'string' ? body.error : t('invoices.emailFailed'));
    } catch {
      toast.error(t('error.network'));
    } finally {
      setEmailSending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('invoices.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/invoices/${params?.id}`, { method: 'DELETE' });
      // An invoice with payments is refused (409). Reporting "deleted" and
      // navigating away would tell the user it was gone when it is still there.
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(t('invoices.deleted'));
      router.push('/invoices');
    } catch {
      toast.error(t('error.network'));
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">{t('common.loading')}</div></div>;
  if (!invoice) return <div className="text-center py-12">{t('invoices.notFound')}</div>;

  const statusInfo = getStatusBadge(invoice?.status ?? 'DRAFT');
  const outstanding = (invoice?.total ?? 0) - (invoice?.amountPaid ?? 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Six actions do not fit beside the invoice number on a phone, so the
          whole row drops below the heading and the buttons share the width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('invoices.backAria')} onClick={() => router.push('/invoices')}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {isProformaInvoice(invoice, company) && (
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('invoices.proformaLabel')}</span>
              )}
              <h1 className="text-2xl font-display font-bold tracking-tight">{invoice?.invoiceNumber}</h1>
              <Badge className={statusInfo?.color ?? ''}>{t(statusInfo.labelKey)}</Badge>
            </div>
            <p className="text-muted-foreground truncate">{invoice?.customer?.name ?? ''}</p>
            {invoice?.sentAt && (
              <p className="text-sm text-muted-foreground">
                {fill('invoices.lastSent', { date: formatCalendarDate(invoice.sentAt, 'MMM d, yyyy', intl) })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice?.status !== 'CANCELLED' && (
            <Button className="flex-1 sm:flex-none" onClick={sendByEmail} disabled={emailSending}>
              <Mail className="w-4 h-4 mr-2" /> {emailSending ? t('invoices.emailSending') : t('invoices.emailSend')}
            </Button>
          )}
          {invoice?.status === 'DRAFT' && <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => updateStatus('SENT')}><Send className="w-4 h-4 mr-2" /> {t('invoices.markSent')}</Button>}
          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice?.status) && (
            <>
              <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none"><CreditCard className="w-4 h-4 mr-2" /> {t('invoices.recordPayment')}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t('invoices.recordPayment')}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>
                        {fill('invoices.amountOutstanding', {
                          amount: formatCurrency(outstanding, invoice?.currency ?? 'USD'),
                        })}
                      </Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={(e: any) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('common.paymentMethod')}</Label>
                      <Select value={paymentForm.paymentMethod} onValueChange={(v: string) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {/* The stored code is the option value; only the
                              label follows the language. */}
                          {PAYMENT_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>{t(paymentMethodLabelKey(method))}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('common.reference')}</Label>
                      <Input placeholder={t('invoices.referencePlaceholder')} value={paymentForm.reference} onChange={(e: any) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                    </div>
                    <Button onClick={recordPayment} className="w-full">{t('invoices.recordPayment')}</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button className="flex-1 sm:flex-none" onClick={() => updateStatus('PAID')}><CheckCircle className="w-4 h-4 mr-2" /> {t('invoices.markPaid')}</Button>
            </>
          )}
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={printInvoice} disabled={pdfLoading}>
            <Printer className="w-4 h-4 mr-2" /> {t('statement.print')}
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={downloadPdf} disabled={pdfLoading}>
            <Download className="w-4 h-4 mr-2" /> {pdfLoading ? t('invoices.generating') : t('listPdf.download')}
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('common.delete')} onClick={handleDelete}><Trash2 className="w-4 h-4 text-red-500" /></Button>
        </div>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">{t('invoices.issueDate')}</p><p className="font-medium">{invoice?.issueDate ? formatCalendarDate(invoice.issueDate, 'MMM d, yyyy', intl) : ''}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">{t('common.dueDate')}</p><p className="font-medium">{invoice?.dueDate ? formatCalendarDate(invoice.dueDate, 'MMM d, yyyy', intl) : ''}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">{t('common.total')}</p><p className="font-mono font-medium">{formatCurrency(invoice?.total ?? 0, invoice?.currency ?? 'USD')}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">{t('customers.outstanding')}</p><p className="font-mono font-medium text-amber-600">{formatCurrency(outstanding, invoice?.currency ?? 'USD')}</p></CardContent></Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('invoices.items')}</CardTitle></CardHeader>
        <CardContent>
          <DocumentLines doc={invoice} currency={invoice?.currency ?? 'USD'}>
            {(invoice?.amountPaid ?? 0) > 0 && <div className="flex justify-between text-base text-green-600"><span>{t('status.paid')}</span><span className="font-mono">{formatCurrency(invoice?.amountPaid ?? 0, invoice?.currency ?? 'USD')}</span></div>}
          </DocumentLines>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice?.notes && (
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t('common.notes')}</p><p className="text-sm mt-1">{invoice.notes}</p></CardContent></Card>
      )}

      {/* Cheques and notes received against this invoice.
          Read-only: the cheque list is where they are managed. Shown above the
          payment history because an instrument in the drawer is the reason a
          payment is *not* there yet. */}
      {(invoice?.chequeInstruments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('cheques.onInvoice')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(invoice?.chequeInstruments ?? []).map((chq: any) => {
                const badge = getChequeStatusBadge(chq?.status);
                return (
                  <Link
                    key={chq?.id}
                    href="/cheques"
                    className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-3 py-2 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t(CHEQUE_INSTRUMENT_LABEL_KEYS[
                          chq?.instrument === 'PROMISSORY_NOTE' ? 'PROMISSORY_NOTE' : 'CHEQUE'
                        ])}
                        {chq?.chequeNumber ? ` · ${chq.chequeNumber}` : ''}
                        {chq?.bankName ? ` · ${chq.bankName}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fill('cheques.dueOn', {
                          date: chq?.dueDate ? formatCalendarDate(chq.dueDate, 'MMM d, yyyy', intl) : '',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">
                        {formatCurrency(chq?.amount ?? 0, chq?.currency ?? invoice?.currency ?? 'USD')}
                      </span>
                      <Badge className={badge.color}>{t(badge.labelKey)}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment history */}
      {(invoice?.payments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('invoices.paymentHistory')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(invoice?.payments ?? []).map((p: any) => (
                <div key={p?.id} className="flex flex-wrap justify-between items-center gap-2 py-2 px-3 rounded bg-muted/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(paymentMethodLabelKey(p?.paymentMethod))}</p>
                    <p className="text-xs text-muted-foreground">{p?.paymentDate ? formatCalendarDate(p.paymentDate, 'MMM d, yyyy', intl) : ''}{p?.reference ? ` • ${p.reference}` : ''}</p>
                  </div>
                  <span className="font-mono font-medium text-green-600">{formatCurrency(p?.amount ?? 0, invoice?.currency ?? 'USD')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

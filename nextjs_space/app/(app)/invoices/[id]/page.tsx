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
import { ArrowLeft, Send, CheckCircle, Download, CreditCard, Trash2, Copy } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { resolveStoredFileUrl } from '@/lib/company-identity';
import { generateInvoiceHtml } from '@/lib/invoice-html';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
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

  const updateStatus = async (status: string) => {
    await fetch(`/api/invoices/${params?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    toast.success(`Invoice marked as ${status.toLowerCase().replace('_', ' ')}`);
    fetchInvoice();
  };

  const recordPayment = async () => {
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    await fetch('/api/payments', {
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
    toast.success('Payment recorded!');
    setPaymentOpen(false);
    setPaymentForm({ amount: '', paymentMethod: 'bank_transfer', reference: '', notes: '' });
    fetchInvoice();
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

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const logoDataUrl = await loadLogoDataUrl();
      const html = generateInvoiceHtml(invoice, company, logoDataUrl);
      const createRes = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html_content: html, pdf_options: { format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } } }),
      });
      const createData = await createRes.json();
      if (!createData?.success || !createData?.token) { toast.error('Failed to generate PDF'); setPdfLoading(false); return; }
      // Poll for status
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const statusRes = await fetch('/api/generate-pdf/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: createData.token }),
        });
        const statusData = await statusRes.json();
        if (statusData?.status === 'SUCCESS' && statusData?.pdf_base64) {
          clearInterval(pollInterval);
          const binaryStr = atob(statusData.pdf_base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${invoice?.invoiceNumber ?? 'invoice'}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          setPdfLoading(false);
          toast.success('PDF downloaded!');
        } else if (statusData?.status === 'FAILED' || attempts > 60) {
          clearInterval(pollInterval);
          setPdfLoading(false);
          toast.error('PDF generation failed');
        }
      }, 2000);
    } catch {
      setPdfLoading(false);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this invoice?')) return;
    await fetch(`/api/invoices/${params?.id}`, { method: 'DELETE' });
    toast.success('Invoice deleted');
    router.push('/invoices');
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!invoice) return <div className="text-center py-12">Invoice not found</div>;

  const statusInfo = getStatusBadge(invoice?.status ?? 'DRAFT');
  const outstanding = (invoice?.total ?? 0) - (invoice?.amountPaid ?? 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/invoices')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold tracking-tight">{invoice?.invoiceNumber}</h1>
            <Badge className={statusInfo?.color ?? ''}>{statusInfo?.label ?? ''}</Badge>
          </div>
          <p className="text-muted-foreground">{invoice?.customer?.name ?? ''}</p>
        </div>
        <div className="flex gap-2">
          {invoice?.status === 'DRAFT' && <Button variant="outline" onClick={() => updateStatus('SENT')}><Send className="w-4 h-4 mr-2" /> Send</Button>}
          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice?.status) && (
            <>
              <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><CreditCard className="w-4 h-4 mr-2" /> Record Payment</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount (Outstanding: {formatCurrency(outstanding, invoice?.currency ?? 'USD')})</Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={(e: any) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment method</Label>
                      <Select value={paymentForm.paymentMethod} onValueChange={(v: string) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Reference</Label>
                      <Input placeholder="Payment reference" value={paymentForm.reference} onChange={(e: any) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                    </div>
                    <Button onClick={recordPayment} className="w-full">Record Payment</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={() => updateStatus('PAID')}><CheckCircle className="w-4 h-4 mr-2" /> Mark Paid</Button>
            </>
          )}
          <Button variant="outline" onClick={downloadPdf} disabled={pdfLoading}>
            <Download className="w-4 h-4 mr-2" /> {pdfLoading ? 'Generating...' : 'PDF'}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete}><Trash2 className="w-4 h-4 text-red-500" /></Button>
        </div>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-medium">{invoice?.issueDate ? format(new Date(invoice.issueDate), 'MMM d, yyyy') : ''}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Due Date</p><p className="font-medium">{invoice?.dueDate ? format(new Date(invoice.dueDate), 'MMM d, yyyy') : ''}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-mono font-medium">{formatCurrency(invoice?.total ?? 0, invoice?.currency ?? 'USD')}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-mono font-medium text-amber-600">{formatCurrency(outstanding, invoice?.currency ?? 'USD')}</p></CardContent></Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Price</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Tax</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice?.items ?? []).map((item: any) => (
                  <tr key={item?.id} className="border-b last:border-0">
                    <td className="py-3">{item?.description ?? ''}</td>
                    <td className="text-right py-3 font-mono">{item?.quantity ?? 0}</td>
                    <td className="text-right py-3 font-mono">{formatCurrency(item?.unitPrice ?? 0, invoice?.currency ?? 'USD')}</td>
                    <td className="text-right py-3 font-mono">{item?.taxRate ?? 0}%</td>
                    <td className="text-right py-3 font-mono font-medium">{formatCurrency(item?.amount ?? 0, invoice?.currency ?? 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(invoice?.subtotal ?? 0, invoice?.currency ?? 'USD')}</span></div>
              {(invoice?.discountTotal ?? 0) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="font-mono text-red-500">-{formatCurrency(invoice?.discountTotal ?? 0, invoice?.currency ?? 'USD')}</span></div>}
              {(invoice?.taxTotal ?? 0) > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span className="font-mono">{formatCurrency(invoice?.taxTotal ?? 0, invoice?.currency ?? 'USD')}</span></div>}
              <div className="border-t pt-2 flex justify-between font-medium"><span>Total</span><span className="font-mono">{formatCurrency(invoice?.total ?? 0, invoice?.currency ?? 'USD')}</span></div>
              {(invoice?.amountPaid ?? 0) > 0 && <div className="flex justify-between text-sm text-green-600"><span>Paid</span><span className="font-mono">{formatCurrency(invoice?.amountPaid ?? 0, invoice?.currency ?? 'USD')}</span></div>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice?.notes && (
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm mt-1">{invoice.notes}</p></CardContent></Card>
      )}

      {/* Payment history */}
      {(invoice?.payments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payment History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(invoice?.payments ?? []).map((p: any) => (
                <div key={p?.id} className="flex justify-between items-center py-2 px-3 rounded bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{p?.paymentMethod?.replace('_', ' ') ?? 'Payment'}</p>
                    <p className="text-xs text-muted-foreground">{p?.paymentDate ? format(new Date(p.paymentDate), 'MMM d, yyyy') : ''}{p?.reference ? ` • ${p.reference}` : ''}</p>
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

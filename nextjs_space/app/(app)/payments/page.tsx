'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, CreditCard, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'USD', paymentDate: '', paymentMethod: 'bank_transfer', invoiceId: '', reference: '', notes: '' });
  useEffect(() => { setForm((p: any) => ({ ...p, paymentDate: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    const [payRes, invRes] = await Promise.all([
      fetch('/api/payments'), fetch('/api/invoices?status=SENT'),
    ]);
    setPayments(await payRes.json().then((d: any) => Array.isArray(d) ? d : []));
    const invData = await invRes.json();
    setInvoices(Array.isArray(invData) ? invData : []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.amount) { toast.error('Amount required'); return; }
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    if (res.ok) { toast.success('Payment recorded!'); setOpen(false); fetchData(); setForm({ amount: '', currency: 'USD', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'bank_transfer', invoiceId: '', reference: '', notes: '' }); }
  };

  const getMethodLabel = (m: string) => {
    const map: Record<string, string> = { bank_transfer: 'Bank Transfer', cash: 'Cash', card: 'Card', other: 'Other' };
    return map[m] ?? m;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">View and record payments</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Record Payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="space-y-1"><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="TRY">TRY</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.paymentDate} onChange={(e: any) => setForm({ ...form, paymentDate: e.target.value })} /></div>
                <div className="space-y-1"><Label>Method</Label>
                  <Select value={form.paymentMethod} onValueChange={(v: string) => setForm({ ...form, paymentMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="bank_transfer">Bank Transfer</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>Link to Invoice</Label>
                <Select value={form.invoiceId} onValueChange={(v: string) => setForm({ ...form, invoiceId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select invoice (optional)" /></SelectTrigger>
                  <SelectContent>{invoices.map((inv: any) => <SelectItem key={inv?.id} value={inv?.id ?? ''}>{inv?.invoiceNumber ?? ''} - {inv?.customer?.name ?? ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Reference</Label><Input placeholder="Payment reference" value={form.reference} onChange={(e: any) => setForm({ ...form, reference: e.target.value })} /></div>
              <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full">Record Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : (payments?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">No payments recorded</h3><p className="text-sm text-muted-foreground">Record your first payment</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {payments.map((p: any) => (
            <Card key={p?.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                      {p?.invoiceId ? <ArrowDownLeft className="w-5 h-5 text-green-600" /> : <ArrowUpRight className="w-5 h-5 text-red-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {p?.invoice ? `Payment for ${p.invoice?.invoiceNumber ?? ''}` : p?.expense ? `Payment: ${p.expense?.description ?? ''}` : 'Payment'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p?.invoice?.customer?.name ?? ''}{p?.reference ? ` • Ref: ${p.reference}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-medium text-green-600">{formatCurrency(p?.amount ?? 0, p?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{p?.paymentDate ? format(new Date(p.paymentDate), 'MMM d, yyyy') : ''}</p>
                    </div>
                    <Badge variant="outline">{getMethodLabel(p?.paymentMethod ?? '')}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxLabel: string;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    dueDate: '',
    issueDate: '',
    currency: 'USD',
    notes: '',
  });

  useEffect(() => {
    setForm((p: any) => ({
      ...p,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    }));
  }, []);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, taxLabel: 'VAT' },
  ]);

  useEffect(() => {
    fetch('/api/customers').then((r: any) => r.json()).then((d: any) => setCustomers(Array.isArray(d) ? d : []));
    fetch('/api/company').then((r: any) => r.json()).then((c: any) => {
      if (c?.defaultCurrency) setForm((p: any) => ({ ...p, currency: c.defaultCurrency }));
    });
  }, []);

  const addItem = () => setItems([...items, { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, taxLabel: 'VAT' }]);
  const removeItem = (idx: number) => setItems(items.filter((_: any, i: number) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const calcLineTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    const disc = item.discount ?? 0;
    const tax = (base - disc) * ((item.taxRate ?? 0) / 100);
    return base - disc + tax;
  };

  const subtotal = items.reduce((s: number, i: InvoiceItem) => s + i.quantity * i.unitPrice, 0);
  const discountTotal = items.reduce((s: number, i: InvoiceItem) => s + (i.discount ?? 0), 0);
  const taxTotal = items.reduce((s: number, i: InvoiceItem) => s + (i.quantity * i.unitPrice - (i.discount ?? 0)) * ((i.taxRate ?? 0) / 100), 0);
  const total = subtotal - discountTotal + taxTotal;

  const handleSubmit = async () => {
    if (!form.customerId) { toast.error('Please select a customer'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    setLoading(true);
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, items }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success('Invoice created!');
      router.push(`/invoices/${data?.id}`);
    } else {
      toast.error('Failed to create invoice');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Create Invoice</h1>
        <p className="text-muted-foreground">Fill in the details to create a new invoice</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select value={form.customerId} onValueChange={(v: string) => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? 'Unnamed'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="TRY">TRY (₺)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Issue date</Label>
              <Input type="date" value={form.issueDate} onChange={(e: any) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Due date *</Label>
              <Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Add item</Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item: InvoiceItem, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-muted/50">
                <div className="col-span-12 md:col-span-4 space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input placeholder="Item description" value={item.description} onChange={(e: any) => updateItem(idx, 'description', e.target.value)} />
                </div>
                <div className="col-span-3 md:col-span-1 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min={1} value={item.quantity} onChange={(e: any) => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="col-span-3 md:col-span-2 space-y-1">
                  <Label className="text-xs">Unit price</Label>
                  <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e: any) => updateItem(idx, 'unitPrice', Number(e.target.value))} />
                </div>
                <div className="col-span-3 md:col-span-1 space-y-1">
                  <Label className="text-xs">Discount</Label>
                  <Input type="number" min={0} step={0.01} value={item.discount} onChange={(e: any) => updateItem(idx, 'discount', Number(e.target.value))} />
                </div>
                <div className="col-span-3 md:col-span-1 space-y-1">
                  <Label className="text-xs">Tax %</Label>
                  <Input type="number" min={0} step={0.01} value={item.taxRate} onChange={(e: any) => updateItem(idx, 'taxRate', Number(e.target.value))} />
                </div>
                <div className="col-span-8 md:col-span-2 flex items-center justify-end">
                  <span className="font-mono text-sm font-medium">{calcLineTotal(item).toFixed(2)}</span>
                </div>
                <div className="col-span-4 md:col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{subtotal.toFixed(2)}</span></div>
              {discountTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="font-mono text-red-500">-{discountTotal.toFixed(2)}</span></div>}
              {taxTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span className="font-mono">{taxTotal.toFixed(2)}</span></div>}
              <div className="border-t pt-2 flex justify-between font-medium"><span>Total</span><span className="font-mono">{total.toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-6">
          <Label>Notes</Label>
          <Textarea placeholder="Additional notes (optional)" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} className="mt-2" />
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="w-4 h-4 mr-2" /> {loading ? 'Creating...' : 'Create Invoice'}
        </Button>
      </div>
    </div>
  );
}

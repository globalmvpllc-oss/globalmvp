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
import { todayCalendarInput, addCalendarDays } from '@/lib/calendar-date';
import { CURRENCIES, getCurrencySymbol } from '@/lib/currencies';
import { useI18n } from '@/components/i18n-provider';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxLabel: string;
}

export default function NewInvoicePage() {
  const { t } = useI18n();
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
    // The due date is filled in once the company's payment terms are known
    // (below); seeding a hardcoded 30 days here would overwrite them.
    setForm((p: any) => ({
      ...p,
      issueDate: todayCalendarInput(),
    }));
  }, []);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, taxLabel: 'VAT' },
  ]);

  /**
   * Kept in state because it seeds every line item added later, not just the
   * first one.
   */
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);

  useEffect(() => {
    fetch('/api/customers').then((r: any) => r.json()).then((d: any) => setCustomers(Array.isArray(d) ? d : []));
    fetch('/api/company')
      .then((r: any) => (r.ok ? r.json() : null))
      .then((c: any) => {
        if (!c) return;

        // Due date follows the company's saved payment terms. These are stored
        // and validated but were never read here, so a business on Net 7 still
        // got invoices dated 30 days out.
        //
        // 0 is a real value ("due on receipt"), so the type check matters:
        // `c.defaultPaymentTerms || 30` would silently restore net 30.
        const terms =
          typeof c.defaultPaymentTerms === 'number' && Number.isFinite(c.defaultPaymentTerms)
            ? c.defaultPaymentTerms
            : 30;
        const dueDate = addCalendarDays(todayCalendarInput(), terms);

        setForm((p: any) => ({
          ...p,
          currency: c.defaultCurrency ?? p.currency,
          dueDate,
          // Only prefill notes the user has not already typed into.
          notes: p.notes || (c.invoiceNotes ?? ''),
        }));

        // Decimal columns arrive as strings from Prisma, hence the Number().
        const rate = Number(c.defaultTaxRate ?? 0);
        if (Number.isFinite(rate) && rate > 0) {
          setDefaultTaxRate(rate);
          setItems((prev: InvoiceItem[]) =>
            prev.map((item: InvoiceItem) =>
              // Only seeds untouched rows, so nothing already entered is lost.
              item.description === '' && item.taxRate === 0 ? { ...item, taxRate: rate } : item
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  const addItem = () =>
    setItems([
      ...items,
      { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: defaultTaxRate, taxLabel: 'VAT' },
    ]);
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
    if (!form.customerId) { toast.error(t('invoices.selectCustomerFirst')); return; }
    if (items.length === 0) { toast.error(t('invoices.addAtLeastOneItem')); return; }
    setLoading(true);
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, items }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(t('invoices.created'));
      router.push(`/invoices/${data?.id}`);
    } else {
      toast.error(t('invoices.createFailed'));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('invoices.create')}</h1>
        <p className="text-muted-foreground">{t('invoices.createSubtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('invoices.details')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('common.customer')} *</Label>
              <Select value={form.customerId} onValueChange={(v: string) => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder={t('invoices.selectCustomer')} /></SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? t('common.unnamed')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.currency')}</Label>
              <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Currency codes and symbols are never translated. */}
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code} ({getCurrencySymbol(c.code)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('invoices.issueDate')}</Label>
              <Input type="date" value={form.issueDate} onChange={(e: any) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.dueDate')} *</Label>
              <Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('invoices.items')}</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> {t('invoices.addItem')}</Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item: InvoiceItem, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-muted/50">
                <div className="col-span-12 md:col-span-4 space-y-1">
                  <Label className="text-xs">{t('common.description')}</Label>
                  <Input placeholder={t('invoices.itemDescription')} value={item.description} onChange={(e: any) => updateItem(idx, 'description', e.target.value)} />
                </div>
                <div className="col-span-6 md:col-span-1 space-y-1">
                  <Label className="text-xs">{t('invoices.qty')}</Label>
                  <Input type="number" min={1} value={item.quantity} onChange={(e: any) => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="col-span-6 md:col-span-2 space-y-1">
                  <Label className="text-xs">{t('invoices.unitPrice')}</Label>
                  <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e: any) => updateItem(idx, 'unitPrice', Number(e.target.value))} />
                </div>
                <div className="col-span-6 md:col-span-1 space-y-1">
                  <Label className="text-xs">{t('invoices.discount')}</Label>
                  <Input type="number" min={0} step={0.01} value={item.discount} onChange={(e: any) => updateItem(idx, 'discount', Number(e.target.value))} />
                </div>
                <div className="col-span-6 md:col-span-1 space-y-1">
                  <Label className="text-xs">{t('invoices.taxPercent')}</Label>
                  <Input type="number" min={0} step={0.01} value={item.taxRate} onChange={(e: any) => updateItem(idx, 'taxRate', Number(e.target.value))} />
                </div>
                <div className="col-span-8 md:col-span-2 flex items-center justify-end">
                  <span className="font-mono text-sm font-medium">{calcLineTotal(item).toFixed(2)}</span>
                </div>
                <div className="col-span-4 md:col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" aria-label={t('invoices.removeItem')} onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full space-y-2 sm:w-64">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.subtotal')}</span><span className="font-mono">{subtotal.toFixed(2)}</span></div>
              {discountTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.discount')}</span><span className="font-mono text-red-500">-{discountTotal.toFixed(2)}</span></div>}
              {taxTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.tax')}</span><span className="font-mono">{taxTotal.toFixed(2)}</span></div>}
              <div className="border-t pt-2 flex justify-between font-medium"><span>{t('common.total')}</span><span className="font-mono">{total.toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-6">
          <Label>{t('common.notes')}</Label>
          <Textarea placeholder={t('invoices.notesPlaceholder')} value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} className="mt-2" />
        </CardContent>
      </Card>

      {/* Full-width, primary action last, rather than two buttons crushed
          against the right edge. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>{t('common.cancel')}</Button>
        <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={loading}>
          <Save className="w-4 h-4 mr-2" /> {loading ? t('invoices.creating') : t('invoices.create')}
        </Button>
      </div>
    </div>
  );
}

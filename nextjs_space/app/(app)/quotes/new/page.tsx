'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { LineItemsEditor, emptyLineItem, type LineItem } from '@/components/line-items-editor';
import { CURRENCIES, getCurrencySymbol } from '@/lib/currencies';
import { addCalendarDays, todayCalendarInput } from '@/lib/calendar-date';
import { isTurkishCountry, taxLabelForCountry } from '@/lib/tr-tax';
import { readErrorMessage } from '@/lib/api-feedback';

/** New quote. Valid for 30 days by default. */
export default function NewQuotePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [turkish, setTurkish] = useState(false);
  const [taxLabel, setTaxLabel] = useState('VAT');
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [form, setForm] = useState({
    customerId: '',
    issueDate: todayCalendarInput(),
    validUntil: addCalendarDays(todayCalendarInput(), 30),
    currency: 'USD',
    notes: '',
  });
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()]);

  useEffect(() => {
    fetch('/api/customers').then((r) => r.json()).then((d) => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/company')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        const label = taxLabelForCountry(c.country);
        const rate = Number(c.defaultTaxRate ?? 0) || 0;
        setTurkish(isTurkishCountry(c.country));
        setTaxLabel(label);
        setDefaultTaxRate(rate);
        setForm((p) => ({ ...p, currency: c.defaultCurrency ?? p.currency }));
        setItems((prev) => prev.map((i) => (i.description === '' ? { ...i, taxRate: rate, taxLabel: label } : i)));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!form.customerId) { toast.error(t('invoices.selectCustomerFirst')); return; }
    if (items.some((i) => !i.description.trim())) { toast.error(t('quotes.itemDescriptionRequired')); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      const quote = await res.json();
      toast.success(t('quotes.created'));
      router.push(`/quotes/${quote.id}`);
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('quotes.new')}</h1>
        <p className="text-base text-muted-foreground">{t('quotes.newSubtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t('quotes.details')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('common.customer')} *</Label>
            <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
              <SelectTrigger><SelectValue placeholder={t('invoices.selectCustomer')} /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('common.currency')}</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} ({getCurrencySymbol(c.code)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('quotes.issueDate')}</Label>
            <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t('quotes.validUntil')} *</Label>
            <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t('invoices.items')}</CardTitle></CardHeader>
        <CardContent>
          <LineItemsEditor items={items} onChange={setItems} currency={form.currency} turkish={turkish} defaultTaxRate={defaultTaxRate} taxLabel={taxLabel} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Label>{t('common.notes')}</Label>
          <Textarea className="mt-2" placeholder={t('quotes.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>{t('common.cancel')}</Button>
        <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? t('common.saving') : t('quotes.save')}
        </Button>
      </div>
    </div>
  );
}

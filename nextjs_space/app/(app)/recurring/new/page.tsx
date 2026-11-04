'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { LineItemsEditor, emptyLineItem, type LineItem } from '@/components/line-items-editor';
import { CURRENCIES, getCurrencySymbol } from '@/lib/currencies';
import { todayCalendarInput } from '@/lib/calendar-date';
import { isTurkishCountry, taxLabelForCountry } from '@/lib/tr-tax';
import { readErrorMessage } from '@/lib/api-feedback';

/** New recurring invoice template. Auto-send stays off unless switched on. */
export default function NewRecurringPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [turkish, setTurkish] = useState(false);
  const [taxLabel, setTaxLabel] = useState('VAT');
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [form, setForm] = useState({
    customerId: '',
    name: '',
    frequency: 'MONTHLY',
    startDate: todayCalendarInput(),
    endDate: '',
    currency: 'USD',
    paymentTermsDays: 30,
    autoSend: false,
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
        setForm((p) => ({
          ...p,
          currency: c.defaultCurrency ?? p.currency,
          paymentTermsDays: typeof c.defaultPaymentTerms === 'number' ? c.defaultPaymentTerms : p.paymentTermsDays,
        }));
        setItems((prev) => prev.map((i) => (i.description === '' ? { ...i, taxRate: rate, taxLabel: label } : i)));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!form.customerId) { toast.error(t('invoices.selectCustomerFirst')); return; }
    if (items.some((i) => !i.description.trim())) { toast.error(t('quotes.itemDescriptionRequired')); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/recurring-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, paymentTermsDays: Number(form.paymentTermsDays) || 0, items }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('recurring.created'));
      router.push('/recurring');
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('recurring.new')}</h1>
        <p className="text-base text-muted-foreground">{t('recurring.newSubtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t('recurring.schedule')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('common.customer')} *</Label>
            <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
              <SelectTrigger><SelectValue placeholder={t('invoices.selectCustomer')} /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('recurring.name')}</Label>
            <Input placeholder={t('recurring.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t('recurring.frequency')}</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">{t('recurring.monthly')}</SelectItem>
                <SelectItem value="QUARTERLY">{t('recurring.quarterly')}</SelectItem>
                <SelectItem value="YEARLY">{t('recurring.yearly')}</SelectItem>
              </SelectContent>
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
            <Label>{t('recurring.startDate')} *</Label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <p className="text-sm text-muted-foreground">{t('recurring.startDateHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('recurring.endDate')}</Label>
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t('recurring.paymentTerms')}</Label>
            <Input type="number" min={0} max={365} value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 md:col-span-2">
            <div>
              <Label>{t('recurring.autoSend')}</Label>
              <p className="text-sm text-muted-foreground">{t('recurring.autoSendHint')}</p>
            </div>
            <Switch checked={form.autoSend} onCheckedChange={(v) => setForm({ ...form, autoSend: v })} aria-label={t('recurring.autoSend')} />
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
          <Textarea className="mt-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>{t('common.cancel')}</Button>
        <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? t('common.saving') : t('recurring.save')}
        </Button>
      </div>
    </div>
  );
}

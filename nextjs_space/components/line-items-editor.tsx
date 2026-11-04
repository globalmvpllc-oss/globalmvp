'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { formatCurrency } from '@/lib/currencies';
import { TR_VAT_RATES } from '@/lib/tr-tax';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxLabel: string;
}

export function emptyLineItem(taxRate = 0, taxLabel = 'VAT'): LineItem {
  return { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate, taxLabel };
}

/** The same arithmetic the server uses, for the live preview only. */
export function lineItemTotals(items: LineItem[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const i of items) {
    const base = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
    const d = Number(i.discount) || 0;
    subtotal += base;
    discount += d;
    tax += Math.max(base - d, 0) * ((Number(i.taxRate) || 0) / 100);
  }
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

/**
 * Line item editor for quotes and recurring invoices — the same fields and
 * layout as the invoice form. Turkish companies pick KDV from 0/1/10/20.
 */
export function LineItemsEditor({
  items,
  onChange,
  currency,
  turkish,
  defaultTaxRate,
  taxLabel,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: string;
  turkish: boolean;
  defaultTaxRate: number;
  taxLabel: string;
}) {
  const { t } = useI18n();
  const update = (idx: number, field: keyof LineItem, value: string | number) =>
    onChange(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  const totals = lineItemTotals(items);
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <div>
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-lg bg-muted/50 p-3">
            <div className="col-span-12 space-y-1 md:col-span-4">
              <Label className="text-sm">{t('common.description')}</Label>
              <Input placeholder={t('invoices.itemDescription')} value={item.description} onChange={(e: any) => update(idx, 'description', e.target.value)} />
            </div>
            <div className="col-span-6 space-y-1 md:col-span-1">
              <Label className="text-sm">{t('invoices.qty')}</Label>
              <Input type="number" min={0} value={item.quantity} onChange={(e: any) => update(idx, 'quantity', Number(e.target.value))} />
            </div>
            <div className="col-span-6 space-y-1 md:col-span-2">
              <Label className="text-sm">{t('invoices.unitPrice')}</Label>
              <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e: any) => update(idx, 'unitPrice', Number(e.target.value))} />
            </div>
            <div className="col-span-6 space-y-1 md:col-span-1">
              <Label className="text-sm">{t('invoices.discount')}</Label>
              <Input type="number" min={0} step={0.01} value={item.discount} onChange={(e: any) => update(idx, 'discount', Number(e.target.value))} />
            </div>
            <div className="col-span-6 space-y-1 md:col-span-1">
              <Label className="text-sm">{t('invoices.taxPercent')}</Label>
              {turkish && (TR_VAT_RATES as readonly number[]).includes(Number(item.taxRate)) ? (
                <Select value={String(item.taxRate)} onValueChange={(v: string) => update(idx, 'taxRate', Number(v))}>
                  <SelectTrigger aria-label={t('invoices.taxPercent')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TR_VAT_RATES.map((rate) => <SelectItem key={rate} value={String(rate)}>%{rate}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input type="number" min={0} max={100} step={0.01} value={item.taxRate} onChange={(e: any) => update(idx, 'taxRate', Number(e.target.value))} />
              )}
            </div>
            <div className="col-span-8 flex items-center justify-end md:col-span-2">
              <span className="font-mono text-sm font-medium">
                {money(Math.max((item.quantity || 0) * (item.unitPrice || 0) - (item.discount || 0), 0) * (1 + (item.taxRate || 0) / 100))}
              </span>
            </div>
            <div className="col-span-4 flex justify-end md:col-span-1">
              {items.length > 1 && (
                <Button variant="ghost" size="icon" aria-label={t('invoices.removeItem')} onClick={() => onChange(items.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => onChange([...items, emptyLineItem(defaultTaxRate, taxLabel)])}>
        <Plus className="mr-1 h-4 w-4" /> {t('invoices.addItem')}
      </Button>
      <div className="mt-6 flex justify-end">
        <div className="w-full space-y-2 sm:w-64">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.subtotal')}</span><span className="font-mono">{money(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.discount')}</span><span className="font-mono text-red-500">-{money(totals.discount)}</span></div>}
          {totals.tax > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('invoices.tax')}</span><span className="font-mono">{money(totals.tax)}</span></div>}
          <div className="flex justify-between border-t pt-2 font-medium"><span>{t('common.total')}</span><span className="font-mono">{money(totals.total)}</span></div>
        </div>
      </div>
    </div>
  );
}

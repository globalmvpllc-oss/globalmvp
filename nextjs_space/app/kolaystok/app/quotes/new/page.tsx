'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { useKs } from '@/components/kolaystok/ks-context';
import { useKsDialog } from '@/components/kolaystok/ks-dialog';
import { ProductLabel } from '@/components/kolaystok/product-label';
import { ProductPhoto } from '@/components/kolaystok/product-photo';
import { ProductPicker, type PickerProduct } from '@/components/kolaystok/product-picker';
import { QUOTE_DEFAULT_VALID_DAYS, exceedsStock, quoteTotals } from '@/lib/stock/rules';

/**
 * "Satış teklifi hazırla": pick or quickly add a customer, add products
 * (photo, size, stock; price from the product's sale price, editable; a
 * warning — never a block — when the quantity is above the stock), choose
 * "KDV %20 ekle", validity and a note, preview the email and the PDF, and only
 * then send. Prices are without VAT. Sending does not change stock.
 */
interface Customer { id: string; name: string; companyName: string | null; email: string | null; phone: string | null }
interface Line { product: PickerProduct; quantity: string; price: string }
interface Preview { to: string; from: string; replyTo: string | null; subject: string; text: string; subtotal: number; taxTotal: number; total: number; validUntil: string }

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const clean = (v: string) => v.replace(/[^0-9.,]/g, '');

export default function KsQuoteNew() {
  const { t, fill, locale } = useI18n();
  const ks = useKs();
  const dialog = useKsDialog();
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', companyName: '', email: '', phone: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const [addVat, setAddVat] = useState(false);
  const [validDays, setValidDays] = useState(String(QUOTE_DEFAULT_VALID_DAYS));
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ quoteNumber: string; to: string } | null>(null);

  const money = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'TRY' }).format(n);
  const qtyText = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);

  useEffect(() => {
    fetch('/api/stock/quotes').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setAddVat(Boolean(d.addVat)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (customer) return;
    const timer = setTimeout(() => {
      fetch(`/api/stock/customers?q=${encodeURIComponent(customerQuery.trim())}`).then((r) => (r.ok ? r.json() : { customers: [] })).then((d) => setCustomers(d.customers)).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [customerQuery, customer]);

  const addedIds = useMemo(() => new Set(lines.map((l) => l.product.id)), [lines]);
  const valid = lines.filter((l) => num(l.quantity) > 0 && Number.isFinite(num(l.price)) && num(l.price) >= 0);
  const totals = quoteTotals(valid.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.price) })), addVat);
  const days = Math.round(num(validDays));
  const ready = Boolean(customer?.email) && valid.length > 0 && valid.length === lines.length && days >= 1 && days <= 365;

  if (!ks.permissions.quotes) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const payload = () => ({
    customerId: customer!.id,
    lines: lines.map((l) => ({ productId: l.product.id, quantity: num(l.quantity), unitPrice: num(l.price) })),
    addVat,
    validDays: days,
    note: note.trim() || null,
  });

  const saveCustomer = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCustomer) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t(data?.code === 'INVALID' ? 'ks.quote.customerInvalid' : res.status === 402 || res.status === 403 ? 'ks.quote.customerLimit' : 'ks.saveFailed')); return; }
      setCustomer(data.customer);
      setAdding(false);
      setNewCustomer({ name: '', companyName: '', email: '', phone: '' });
    } finally {
      setBusy(false);
    }
  };

  const add = (p: PickerProduct) => {
    if (addedIds.has(p.id)) return;
    setLines((prev) => [...prev, { product: p, quantity: '1', price: p.salePrice === null ? '' : String(p.salePrice).replace('.', ',') }]);
    toast.success(fill('ks.picker.addedToast', { name: p.name }));
  };
  const update = (id: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));

  const showPreview = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/quotes/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t(data?.code === 'NO_EMAIL' ? 'ks.quote.noEmail' : 'ks.saveFailed')); return; }
      setPreview(data);
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/quotes/preview?format=pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!(await dialog.confirm(fill('ks.quote.sendConfirm', { to: preview?.to ?? '' }), { yes: 'ks.quote.sendYes' }))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), confirmed: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(t(data?.code === 'SEND_FAILED' ? 'ks.quote.sendFailedSaved' : 'ks.quote.sendFailed'));
        return;
      }
      setSent({ quoteNumber: data.quoteNumber, to: data.to });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 py-6 text-center">
        <h1 className="text-2xl font-bold">{t('ks.quote.sentTitle')}</h1>
        <p className="text-xl">{fill('ks.quote.sentBody', { number: sent.quoteNumber, to: sent.to })}</p>
        <Link href="/kolaystok/app/quotes" className="flex h-14 items-center justify-center rounded-xl bg-teal-700 text-lg font-semibold text-white">{t('ks.quote.list')}</Link>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('ks.quote.previewTitle')}</h1>
        <dl className="space-y-1 rounded-2xl bg-white p-4 text-base shadow-sm">
          <div><dt className="inline font-semibold">{t('ks.order.to')}: </dt><dd className="inline break-all">{preview.to}</dd></div>
          <div><dt className="inline font-semibold">{t('ks.order.from')}: </dt><dd className="inline">{preview.from}</dd></div>
          {preview.replyTo && <div><dt className="inline font-semibold">{t('ks.order.replyTo')}: </dt><dd className="inline">{preview.replyTo}</dd></div>}
          <div><dt className="inline font-semibold">{t('ks.order.subject')}: </dt><dd className="inline">{preview.subject}</dd></div>
        </dl>
        <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 font-sans text-base leading-relaxed shadow-sm">{preview.text}</pre>
        <button type="button" onClick={openPdf} disabled={busy} className="h-14 w-full rounded-xl border-2 border-teal-700 text-lg font-semibold text-teal-800 disabled:opacity-50">{t('ks.quote.openPdf')}</button>
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">{t('ks.quote.manualOnly')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPreview(null)} className="h-14 rounded-xl border text-lg">{t('ks.order.back')}</button>
          <button type="button" onClick={send} disabled={busy} className="h-14 rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-50">{t('ks.order.send')}</button>
        </div>
        {dialog.element}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('ks.quote.prepare')}</h1>

      {/* 1. Customer */}
      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">1. {t('ks.quote.customer')}</h2>
        {customer ? (
          <div className="flex items-start justify-between gap-3 rounded-xl bg-teal-50 p-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold">{customer.name}</p>
              {customer.companyName && <p className="text-base">{customer.companyName}</p>}
              <p className="break-all text-base text-slate-600">{customer.email || t('ks.quote.noEmail')}</p>
            </div>
            <button type="button" onClick={() => setCustomer(null)} className="h-11 shrink-0 rounded-xl border bg-white px-3 text-base">{t('ks.quote.change')}</button>
          </div>
        ) : adding ? (
          <div className="space-y-2">
            {(['name', 'companyName', 'email', 'phone'] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-base font-medium">{t(`ks.quote.field.${k}` as any)}</span>
                <input
                  value={newCustomer[k]}
                  onChange={(e) => setNewCustomer({ ...newCustomer, [k]: e.target.value })}
                  inputMode={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
                  type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
                  autoComplete="off"
                  className="h-12 w-full rounded-xl border-2 px-3 text-lg"
                />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAdding(false)} className="h-14 rounded-xl border text-lg">{t('ks.qty.cancel')}</button>
              <button type="button" onClick={saveCustomer} disabled={busy || !newCustomer.name.trim() || !newCustomer.email.trim()} className="h-14 rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-40">{t('ks.qty.save')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="search"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder={t('ks.quote.searchCustomer')}
              aria-label={t('ks.quote.searchCustomer')}
              className="h-14 w-full rounded-xl border-2 px-3 text-lg outline-none focus:border-teal-600"
            />
            <ul className="space-y-1">
              {customers.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCustomer(c)} className="w-full rounded-xl border px-3 py-3 text-left active:bg-slate-50">
                    <span className="block text-lg font-semibold">{c.name}{c.companyName ? ` · ${c.companyName}` : ''}</span>
                    <span className="block break-all text-sm text-slate-500">{c.email || t('ks.quote.noEmail')}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setAdding(true)} className="h-14 w-full rounded-xl border-2 border-dashed border-teal-700 text-lg font-semibold text-teal-800">+ {t('ks.quote.newCustomer')}</button>
          </div>
        )}
      </section>

      {/* 2. Products */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">2. {t('ks.quote.products')}</h2>
        <ProductPicker addedIds={addedIds} onAdd={add} />
        {lines.length > 0 && (
          <ul className="divide-y">
            {lines.map((l) => {
              const q = num(l.quantity);
              const over = q > 0 && exceedsStock(q, l.product.quantity);
              const amount = q > 0 && Number.isFinite(num(l.price)) ? quoteTotals([{ quantity: q, unitPrice: num(l.price) }], false).subtotal.toNumber() : 0;
              return (
                <li key={l.product.id} className="space-y-2 py-3">
                  <div className="flex items-start gap-3">
                    <ProductPhoto id={l.product.id} name={l.product.name} hasPhoto={l.product.hasPhoto} size={48} />
                    <div className="min-w-0 flex-1">
                      <ProductLabel name={l.product.name} size={l.product.size} code={l.product.code} extra={`${t('ks.picker.stock')}: ${qtyText(l.product.quantity)} ${l.product.unit}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">{t('ks.qty.amount')} ({l.product.unit})</span>
                      <input inputMode="decimal" value={l.quantity} onChange={(e) => update(l.product.id, { quantity: clean(e.target.value) })} className="h-14 w-full rounded-lg border-2 px-3 text-right text-xl tabular-nums" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">{t('ks.quote.unitPrice')}</span>
                      <input inputMode="decimal" value={l.price} onChange={(e) => update(l.product.id, { price: clean(e.target.value) })} className="h-14 w-full rounded-lg border-2 px-3 text-right text-xl tabular-nums" />
                    </label>
                  </div>
                  {over && (
                    <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-base font-medium text-amber-900">
                      <AlertTriangle className="h-5 w-5 shrink-0" /> {fill('ks.quote.overStock', { stock: `${qtyText(l.product.quantity)} ${l.product.unit}` })}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))} className="h-12 rounded-xl border-2 border-red-200 px-4 text-base font-semibold text-red-700">{t('ks.order.remove')}</button>
                    <span className="text-lg font-semibold tabular-nums">{money(amount)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. VAT, validity, note, totals */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">3. {t('ks.quote.details')}</h2>
        <label className="flex min-h-[3.5rem] items-center gap-3 rounded-xl border-2 px-3">
          <input type="checkbox" checked={addVat} onChange={(e) => setAddVat(e.target.checked)} className="h-7 w-7 accent-teal-700" />
          <span className="text-lg font-medium">{t('ks.quote.addVat')}</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-medium">{t('ks.quote.validDays')}</span>
          <input inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, '').slice(0, 3))} className="h-14 w-32 rounded-lg border-2 px-3 text-right text-xl tabular-nums" />
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-medium">{t('ks.qty.note')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-xl border-2 p-3 text-base" />
        </label>
        <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-lg tabular-nums">
          {addVat ? (
            <>
              <div className="flex justify-between"><dt>{t('ks.quote.subtotal')}</dt><dd>{money(totals.subtotal.toNumber())}</dd></div>
              <div className="flex justify-between"><dt>{t('ks.quote.vat')}</dt><dd>{money(totals.tax.toNumber())}</dd></div>
              <div className="flex justify-between text-xl font-bold"><dt>{t('ks.quote.grandTotal')}</dt><dd>{money(totals.total.toNumber())}</dd></div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-xl font-bold"><dt>{t('ks.quote.total')}</dt><dd>{money(totals.total.toNumber())}</dd></div>
              <p className="text-base text-slate-600">{t('ks.quote.vatExcluded')}</p>
            </>
          )}
        </dl>
      </section>

      {!customer?.email && customer && <p className="text-base font-medium text-red-700">{t('ks.quote.noEmail')}</p>}
      <button type="button" onClick={showPreview} disabled={!ready || busy} className="h-16 w-full rounded-xl bg-slate-900 text-xl font-bold text-white disabled:opacity-40">{t('ks.quote.preview')}</button>
      {dialog.element}
    </div>
  );
}

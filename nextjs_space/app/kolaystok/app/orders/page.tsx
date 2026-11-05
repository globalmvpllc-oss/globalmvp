'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';
import { ProductLabel } from '@/components/kolaystok/product-label';
import { ProductPhoto } from '@/components/kolaystok/product-photo';
import { ProductPicker, type PickerProduct } from '@/components/kolaystok/product-picker';
import { orderGroupBlocker, splitEmails } from '@/lib/stock/contacts';

/**
 * "Sipariş maili hazırla". Critical products come in by themselves with the
 * suggested quantity; any other product can be found and added — it goes to
 * the top of its supplier's group, highlighted for a moment. Every line can
 * change its quantity or be removed. Products with no supplier get one here
 * (one by one, or all at once); a supplier with no address gets one here.
 * Supplier details are re-read whenever the screen comes back into view, so
 * a change on the Suppliers page shows at once. If "Preview" is not ready,
 * the reason is written right above it. Nothing is sent without "Send".
 */
interface Line { productId: string; code: string; name: string; size: string | null; unit: string; hasPhoto: boolean; stock: number; vendorId: string | null }
interface Vendor { id: string; name: string; emails: string[] }

export default function KsOrders() {
  const { t, fill, locale } = useI18n();
  const ks = useKs();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [failed, setFailed] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [newEmails, setNewEmails] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ vendorId: string; to: string[]; from: string; replyTo: string | null; subject: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);

  const loadVendors = useCallback(() => {
    fetch('/api/stock/suppliers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((s) => setVendors((s.suppliers ?? []).map((v: any) => ({ id: v.id, name: v.name, emails: Array.isArray(v.emails) ? v.emails : [] }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/stock/orders', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => {
        const flat: Line[] = [];
        const q: Record<string, string> = {};
        for (const g of d.groups) {
          for (const l of g.lines) {
            flat.push({ productId: l.productId, code: l.code, name: l.name, size: l.size, unit: l.unit, hasPhoto: Boolean(l.hasPhoto), stock: Number(l.stock ?? 0), vendorId: g.vendorId });
            q[l.productId] = String(l.quantity);
          }
        }
        setLines(flat);
        setQty(q);
      })
      .catch(() => setFailed(true));
    loadVendors();
    // Back from the Suppliers page (or another tab): show the saved addresses.
    const onVisible = () => { if (document.visibilityState === 'visible') loadVendors(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadVendors);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadVendors);
    };
  }, [loadVendors]);

  const vendorOf = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const groups = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const l of lines ?? []) map.set(l.vendorId ?? '', [...(map.get(l.vendorId ?? '') ?? []), l]);
    return [...map.entries()]
      .map(([key, ls]) => ({ vendorId: key || null, lines: ls }))
      .sort((a, b) => (a.vendorId === null ? 1 : b.vendorId === null ? -1 : (vendorOf.get(a.vendorId)?.name ?? '').localeCompare(vendorOf.get(b.vendorId)?.name ?? '', 'tr')));
  }, [lines, vendorOf]);
  const addedIds = useMemo(() => new Set((lines ?? []).map((l) => l.productId)), [lines]);
  const numberOf = (productId: string) => Number((qty[productId] ?? '').replace(',', '.'));

  if (!ks.permissions.orderEmail) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const add = (p: PickerProduct) => {
    if (addedIds.has(p.id)) return;
    // To the top of its group: lines keep their order inside each group.
    setLines((prev) => [{ productId: p.id, code: p.code, name: p.name, size: p.size, unit: p.unit, hasPhoto: p.hasPhoto, stock: p.quantity, vendorId: p.vendorId }, ...(prev ?? [])]);
    setQty((prev) => ({ ...prev, [p.id]: String(p.suggested) }));
    setFlash(p.id);
    setTimeout(() => setFlash((f) => (f === p.id ? null : f)), 2000);
    toast.success(fill('ks.picker.addedToast', { name: p.name }));
  };
  const remove = (productId: string) => setLines((prev) => (prev ?? []).filter((l) => l.productId !== productId));

  const assignVendor = async (productIds: string[], vendorId: string) => {
    if (!vendorId || productIds.length === 0) return;
    setBusy(true);
    try {
      const done: string[] = [];
      for (const productId of productIds) {
        const res = await fetch('/api/stock/orders/vendor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, vendorId }) });
        if (res.ok) done.push(productId);
      }
      setLines((prev) => (prev ?? []).map((l) => (done.includes(l.productId) ? { ...l, vendorId } : l)));
      if (done.length === productIds.length) toast.success(t('ks.order.supplierSaved'));
      else toast.error(t('ks.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveEmails = async (vendorId: string) => {
    const emails = splitEmails(newEmails[vendorId]);
    if (emails.length === 0) { toast.error(t('ks.order.emailInvalid')); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/stock/suppliers/${encodeURIComponent(vendorId)}/emails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: emails.join(', ') }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t(res.status === 403 ? 'ks.forbidden' : 'ks.order.emailInvalid')); return; }
      setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, emails: data.emails } : v)));
      setNewEmails((prev) => ({ ...prev, [vendorId]: '' }));
      toast.success(t('ks.order.emailSaved'));
    } finally {
      setBusy(false);
    }
  };

  const body = (vendorId: string, ls: Line[]) => ({
    vendorId,
    lines: ls.map((l) => ({ productId: l.productId, quantity: numberOf(l.productId) })).filter((l) => l.quantity > 0),
    note: note[vendorId] || null,
  });

  const showPreview = async (vendorId: string, ls: Line[]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/orders/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(vendorId, ls)) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t(data?.code === 'NO_EMAIL' ? 'ks.order.noEmail' : 'ks.saveFailed')); return; }
      setPreview({ vendorId, ...data });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const g = groups.find((x) => x.vendorId === preview?.vendorId);
    if (!g || !g.vendorId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock/orders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body(g.vendorId, g.lines), confirmed: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t('ks.order.failed')); return; }
      toast.success(fill('ks.order.sent', { n: data.sent }));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('ks.order.previewTitle')}</h1>
        <dl className="space-y-1 rounded-2xl bg-white p-4 text-base shadow-sm">
          <div><dt className="inline font-semibold">{t('ks.order.to')}: </dt><dd className="inline break-all">{preview.to.join(', ')}</dd></div>
          <div><dt className="inline font-semibold">{t('ks.order.from')}: </dt><dd className="inline">{preview.from}</dd></div>
          {preview.replyTo && <div><dt className="inline font-semibold">{t('ks.order.replyTo')}: </dt><dd className="inline">{preview.replyTo}</dd></div>}
          <div><dt className="inline font-semibold">{t('ks.order.subject')}: </dt><dd className="inline">{preview.subject}</dd></div>
        </dl>
        <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 font-sans text-base leading-relaxed shadow-sm">{preview.text}</pre>
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">{t('ks.order.manualOnly')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPreview(null)} className="h-14 rounded-xl border text-lg">{t('ks.order.back')}</button>
          <button type="button" onClick={send} disabled={busy} className="h-14 rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-50">{t('ks.order.send')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('ks.order.prepare')}</h1>
      <p className="text-base text-slate-600">{t('ks.order.hint')}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('ks.order.addProducts')}</h2>
        <ProductPicker addedIds={addedIds} onAdd={add} />
      </section>

      {lines === null && <p className="text-lg">{failed ? t('ks.loadFailed') : t('common.loading')}</p>}
      {lines?.length === 0 && <p className="py-6 text-center text-lg font-semibold text-amber-800">{t('ks.block.noProducts')}</p>}

      {groups.map((g) => {
        const vendor = g.vendorId ? vendorOf.get(g.vendorId) : null;
        const emails = vendor?.emails ?? [];
        const blocker = orderGroupBlocker({ vendorId: g.vendorId, vendorName: vendor?.name ?? null, emails, lines: g.lines.map((l) => ({ quantity: numberOf(l.productId) })) });
        return (
          <section key={g.vendorId ?? 'none'} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xl font-semibold">{vendor?.name ?? t('ks.order.noSupplier')}</h2>
            {vendor && emails.length > 0 && <p className="break-all text-sm text-slate-500">{emails.join(', ')}</p>}

            {vendor && emails.length === 0 && (
              <div className="space-y-2 rounded-xl bg-amber-50 p-3">
                <label className="block">
                  <span className="mb-1 block text-base font-medium text-amber-900">{fill('ks.order.addEmailFor', { name: vendor.name })}</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={newEmails[vendor.id] ?? ''}
                    onChange={(e) => setNewEmails({ ...newEmails, [vendor.id]: e.target.value })}
                    placeholder="siparis@ornek.com"
                    className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg"
                  />
                </label>
                <button type="button" disabled={busy || splitEmails(newEmails[vendor.id]).length === 0} onClick={() => saveEmails(vendor.id)} className="h-12 w-full rounded-xl bg-teal-700 text-base font-semibold text-white disabled:opacity-40">
                  {t('ks.qty.save')}
                </button>
              </div>
            )}

            {!g.vendorId && vendors.length > 0 && (
              <label className="block rounded-xl bg-slate-50 p-3">
                <span className="mb-1 block text-base font-semibold">{t('ks.order.pickSupplierAll')}</span>
                <select value="" onChange={(e) => assignVendor(g.lines.map((l) => l.productId), e.target.value)} disabled={busy} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg">
                  <option value="" disabled>{t('ks.order.pickSupplier')}</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
            )}

            <ul className="divide-y">
              {g.lines.map((l) => (
                <li key={l.productId} className={`space-y-2 rounded-lg py-3 transition-colors duration-700 ${flash === l.productId ? 'bg-amber-100 px-2' : ''}`}>
                  <div className="flex items-start gap-3">
                    <ProductPhoto id={l.productId} name={l.name} hasPhoto={l.hasPhoto} size={48} />
                    <div className="min-w-0 flex-1">
                      <ProductLabel name={l.name} size={l.size} code={l.code} extra={`${t('ks.picker.stock')}: ${fmt(l.stock)} ${l.unit}`} />
                    </div>
                  </div>
                  {!g.vendorId && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-600">{t('ks.order.pickSupplier')}</span>
                      <select value="" onChange={(e) => assignVendor([l.productId], e.target.value)} disabled={busy} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg">
                        <option value="" disabled>{t('ks.order.pickSupplier')}</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      {vendors.length === 0 && <span className="mt-1 block text-sm text-slate-500">{t('ks.order.noSuppliersYet')}</span>}
                    </label>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => remove(l.productId)} className="h-12 rounded-xl border-2 border-red-200 px-4 text-base font-semibold text-red-700">
                      {t('ks.order.remove')}
                    </button>
                    <label className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={qty[l.productId] ?? ''}
                        onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value.replace(/[^0-9.,]/g, '') })}
                        className="h-14 w-32 rounded-lg border-2 px-3 text-right text-xl tabular-nums"
                        aria-label={`${t('ks.qty.amount')}: ${l.name}${l.size ? ` ${l.size}` : ''}`}
                      />
                      <span className="text-sm text-slate-500">{l.unit}</span>
                    </label>
                  </div>
                </li>
              ))}
            </ul>

            {g.vendorId && (
              <textarea value={note[g.vendorId] ?? ''} onChange={(e) => setNote({ ...note, [g.vendorId!]: e.target.value })} rows={2} placeholder={t('ks.qty.note')} className="w-full rounded-xl border p-3 text-base" />
            )}
            {blocker && <p className="text-lg font-semibold text-amber-800" role="status">{fill(blocker.key as TranslationKey, blocker.params ?? {})}</p>}
            {g.vendorId && (
              <button type="button" onClick={() => showPreview(g.vendorId!, g.lines)} disabled={busy || Boolean(blocker)} className="h-14 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40">
                {t('ks.order.preview')}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

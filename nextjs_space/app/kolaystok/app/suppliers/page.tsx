'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { useKs } from '@/components/kolaystok/ks-context';

/**
 * Suppliers (manager): any number, each with several emails, a phone and a
 * note. Below, each category can be tied to a supplier; a product can still
 * name its own supplier in the product form.
 */
interface Supplier { id: string; name: string; emails: string[]; phone: string | null; notes: string | null }
const EMPTY = { id: '', name: '', emails: '', phone: '', notes: '' };

export default function KsSuppliers() {
  const { t } = useI18n();
  const ks = useKs();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; vendorId: string | null }>>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    fetch('/api/stock/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? [])).catch(() => {});
    fetch('/api/stock/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!ks.permissions.suppliers) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const save = async () => {
    const body = {
      name: form.name,
      emails: form.emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      phone: form.phone || null,
      notes: form.notes || null,
    };
    const res = await fetch(form.id ? `/api/stock/suppliers/${form.id}` : '/api/stock/suppliers', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { toast.error(t('ks.sup.invalid')); return; }
    toast.success(t('ks.set.saved'));
    setForm(EMPTY);
    setEditing(false);
    load();
  };

  const linkCategory = async (categoryId: string, vendorId: string) => {
    const res = await fetch(`/api/stock/categories/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: vendorId || null }),
    });
    toast[res.ok ? 'success' : 'error'](t(res.ok ? 'ks.set.saved' : 'ks.saveFailed'));
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('ks.nav.suppliers')}</h1>
        {ks.permissions.orderEmail && (
          <Link href="/kolaystok/app/orders" className="flex h-12 items-center rounded-xl bg-slate-900 px-4 text-base font-semibold text-white">{t('ks.order.prepare')}</Link>
        )}
      </div>

      {!editing ? (
        <button type="button" onClick={() => { setForm(EMPTY); setEditing(true); }} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-semibold text-white">
          {t('ks.sup.add')}
        </button>
      ) : (
        <form className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('ks.sup.name')} required className="h-12 w-full rounded-xl border-2 px-3 text-lg" />
          <label className="block">
            <span className="mb-1 block text-base">{t('ks.sup.emails')}</span>
            <textarea value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} rows={2} placeholder="satis@ornek.com, depo@ornek.com" className="w-full rounded-xl border-2 p-3 text-lg" />
          </label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('ks.sup.phone')} inputMode="tel" className="h-12 w-full rounded-xl border-2 px-3 text-lg" />
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('ks.product.notes')} rows={2} className="w-full rounded-xl border-2 p-3 text-lg" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-12 rounded-xl border text-lg">{t('ks.qty.cancel')}</button>
            <button type="submit" className="h-12 rounded-xl bg-teal-700 text-lg font-semibold text-white">{t('ks.qty.save')}</button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {suppliers.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => { setForm({ id: s.id, name: s.name, emails: s.emails.join(', '), phone: s.phone ?? '', notes: s.notes ?? '' }); setEditing(true); window.scrollTo({ top: 0 }); }}
              className="w-full rounded-xl bg-white p-3 text-left shadow-sm"
            >
              <p className="text-lg font-semibold">{s.name}</p>
              <p className="break-all text-base text-slate-600">{s.emails.join(', ') || '—'}{s.phone ? ` · ${s.phone}` : ''}</p>
            </button>
          </li>
        ))}
      </ul>

      {categories.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t('ks.sup.byCategory')}</h2>
          <p className="text-base text-slate-600">{t('ks.sup.byCategoryHint')}</p>
          {categories.map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm">
              <span className="text-base font-medium">{c.name}</span>
              <select value={c.vendorId ?? ''} onChange={(e) => linkCategory(c.id, e.target.value)} className="h-11 max-w-[55%] rounded-lg border px-2 text-base">
                <option value="">{t('ks.product.none')}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ))}
        </section>
      )}
    </div>
  );
}

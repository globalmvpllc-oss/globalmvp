'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { ProductPhoto } from '@/components/kolaystok/product-photo';
import { ProductLabel } from '@/components/kolaystok/product-label';

/**
 * Sayım (stock count). Pick a category (or resume a count left open), then one
 * product at a time: type the number, press Enter (or "Next"), and the next
 * product comes up. Every number is saved as you go, so a count can be left
 * and continued later. "Finish" writes the differences as "Sayım düzeltmesi".
 */
interface CountProduct { id: string; code: string; name: string; size: string | null; unit: string; shelf: string | null; hasPhoto: boolean; counted: number | null }

export default function KsCount() {
  const { t, fill, locale } = useI18n();
  const [categories, setCategories] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [open, setOpen] = useState<Array<{ id: string; categoryName: string | null; startedBy: string; createdAt: string; counted: number }>>([]);
  const [countId, setCountId] = useState<string | null>(null);
  const [products, setProducts] = useState<CountProduct[]>([]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState<{ counted: number; changed: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(() => {
    fetch('/api/stock/categories').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCategories(d.categories)).catch(() => {});
    fetch('/api/stock/counts').then((r) => (r.ok ? r.json() : null)).then((d) => d && setOpen(d.counts)).catch(() => {});
  }, []);
  useEffect(() => { loadLists(); }, [loadLists]);

  const openCount = async (id: string) => {
    const res = await fetch(`/api/stock/counts/${id}`);
    if (!res.ok) { toast.error(t('ks.loadFailed')); return; }
    const data = await res.json();
    setCountId(id);
    setProducts(data.products);
    const start = Math.min(data.position ?? 0, Math.max(data.products.length - 1, 0));
    setIndex(start);
    const first = data.products[start]?.counted;
    setValue(first === null || first === undefined ? '' : String(first));
    setFinished(null);
  };

  const start = async (categoryId: string | null) => {
    const res = await fetch('/api/stock/counts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId }) });
    if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
    openCount((await res.json()).id);
  };

  useEffect(() => { input.current?.focus(); }, [index, countId]);

  const go = (next: number) => {
    const bounded = Math.max(0, Math.min(next, products.length - 1));
    setIndex(bounded);
    const c = products[bounded]?.counted;
    setValue(c === null || c === undefined ? '' : String(c));
  };

  const saveAndNext = async () => {
    const product = products[index];
    if (!product || !countId) return;
    // Empty = skip this product. Anything that is not a plain number stays
    // on screen with a message, so nothing is skipped by mistake.
    if (value.trim() === '') {
      go(index + 1);
      return;
    }
    const plain = value.trim().replace(/\s/g, '');
    const n = /^\d+([.,]\d+)?$/.test(plain) ? Number(plain.replace(',', '.')) : NaN;
    if (!Number.isFinite(n)) {
      toast.error(t('ks.count.invalid'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/counts/${countId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, counted: n, position: Math.min(index + 1, products.length - 1) }),
      });
      if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
      setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, counted: n } : p)));
      if (index < products.length - 1) go(index + 1);
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!countId) return;
    const done = products.filter((p) => p.counted !== null).length;
    if (!window.confirm(fill('ks.count.finishConfirm', { done, total: products.length }))) return;
    const res = await fetch(`/api/stock/counts/${countId}/finish`, { method: 'POST' });
    if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
    setFinished(await res.json());
    setCountId(null);
    loadLists();
  };

  const cancel = async () => {
    if (!countId || !window.confirm(t('ks.count.cancelConfirm'))) return;
    await fetch(`/api/stock/counts/${countId}`, { method: 'DELETE' });
    setCountId(null);
    loadLists();
  };

  if (finished) {
    return (
      <div className="space-y-4 py-6 text-center">
        <h1 className="text-2xl font-bold">{t('ks.count.done')}</h1>
        <p className="text-xl">{fill('ks.count.doneBody', { counted: finished.counted, changed: finished.changed })}</p>
        <button type="button" onClick={() => setFinished(null)} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-semibold text-white">{t('ks.count.newCount')}</button>
      </div>
    );
  }

  if (!countId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('ks.nav.count')}</h1>
        {open.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t('ks.count.resume')}</h2>
            {open.map((c) => (
              <button key={c.id} type="button" onClick={() => openCount(c.id)} className="flex h-16 w-full items-center justify-between rounded-xl bg-amber-50 px-4 text-left">
                <span className="text-lg font-semibold">{c.categoryName ?? t('ks.allCategories')}</span>
                <span className="text-base text-slate-600">{fill('ks.count.progress', { done: c.counted })} · {c.startedBy}</span>
              </button>
            ))}
          </section>
        )}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('ks.count.pick')}</h2>
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => start(c.id)} className="flex h-16 w-full items-center justify-between rounded-xl bg-white px-4 text-left shadow-sm">
              <span className="text-lg font-semibold">{c.name}</span>
              <span className="text-base text-slate-500">{c.count}</span>
            </button>
          ))}
          <button type="button" onClick={() => start(null)} className="h-14 w-full rounded-xl border-2 text-lg font-medium">{t('ks.count.everything')}</button>
        </section>
      </div>
    );
  }

  const product = products[index];
  if (!product) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-lg">{t('ks.empty')}</p>
        <button type="button" onClick={cancel} className="h-12 w-full rounded-xl border text-lg">{t('ks.qty.cancel')}</button>
      </div>
    );
  }
  const done = products.filter((p) => p.counted !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-base text-slate-600">
        <span>{fill('ks.count.position', { n: index + 1, total: products.length })}</span>
        <span>{fill('ks.count.progress', { done })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-teal-600" style={{ width: `${(done / products.length) * 100}%` }} />
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <ProductPhoto id={product.id} name={product.name} hasPhoto={product.hasPhoto} size={80} />
        <ProductLabel
          large
          name={product.name}
          size={product.size}
          code={product.code}
          extra={product.shelf ? `${t('ks.product.shelf')}: ${product.shelf}` : null}
        />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); saveAndNext(); }} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-lg font-medium">{fill('ks.count.howMany', { unit: product.unit })}</span>
          <input
            ref={input}
            inputMode="decimal"
            enterKeyHint="next"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
            className="h-20 w-full rounded-2xl border-2 px-4 text-center text-4xl font-bold tabular-nums outline-none focus:border-teal-600"
          />
        </label>
        <button type="submit" disabled={saving} className="h-16 w-full rounded-xl bg-teal-700 text-xl font-bold text-white disabled:opacity-50">
          {index < products.length - 1 ? t('ks.count.next') : t('ks.count.save')}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="flex h-12 items-center justify-center gap-1 rounded-xl border bg-white text-base disabled:opacity-40">
          <ChevronLeft className="h-5 w-5" /> {t('ks.count.prev')}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index >= products.length - 1} className="flex h-12 items-center justify-center gap-1 rounded-xl border bg-white text-base disabled:opacity-40">
          {t('ks.count.skip')} <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <button type="button" onClick={finish} className="h-14 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white">{t('ks.count.finish')}</button>
      <div className="flex justify-between">
        <button type="button" onClick={() => setCountId(null)} className="h-11 text-base text-slate-600">{t('ks.count.later')}</button>
        <button type="button" onClick={cancel} className="h-11 text-base text-red-600">{t('ks.count.cancel')}</button>
      </div>
      <p className="text-center text-sm text-slate-500" lang={locale}>{t('ks.count.hint')}</p>
    </div>
  );
}

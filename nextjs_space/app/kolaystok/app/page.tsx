'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';
import { ProductPhoto } from '@/components/kolaystok/product-photo';
import { ProductLabel } from '@/components/kolaystok/product-label';
import { MANUAL_REASONS, entryDirection, planEntry } from '@/lib/stock/rules';

/**
 * Avc KolayStok — home. Built for one hand on a phone:
 * a big search box (1–2 letters is enough), category chips, three tiles,
 * and a list where every row has big − and + buttons. One tap = one unit.
 * Tapping the number opens "how many, and why". Every change offers "Undo"
 * for 10 seconds. The amount is always positive and the reason decides the
 * direction; a large amount or a drop below zero asks first (the server
 * enforces the same and answers 409 CONFIRM if the stock moved meanwhile).
 */
interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  level: 'ok' | 'low' | 'out';
  hasPhoto: boolean;
  categoryName: string | null;
  size: string | null;
}

const LEVEL_STYLE: Record<Product['level'], string> = {
  ok: 'text-emerald-700 bg-emerald-50',
  low: 'text-amber-800 bg-amber-100',
  out: 'text-red-700 bg-red-100',
};

const fmt = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);

export default function KolayStokHome() {
  const { t, fill, locale } = useI18n();
  const ks = useKs();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [level, setLevel] = useState<string>(params?.get('level') === 'out' ? 'out' : params?.get('level') === 'low' ? 'low' : '');
  const [categories, setCategories] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [summary, setSummary] = useState<{ low: number; out: number; today: number } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [question, setQuestion] = useState<{ text: string; tone: 'warn' | 'danger'; resolve: (yes: boolean) => void } | null>(null);
  const requestId = useRef(0);

  const ask = (text: string, tone: 'warn' | 'danger') => new Promise<boolean>((resolve) => setQuestion({ text, tone, resolve }));
  const answer = (yes: boolean) => {
    question?.resolve(yes);
    setQuestion(null);
  };

  /** "Emin misiniz? X adet" and/or "Stok eksiye düşecek (−X)" — true only if every question got a yes. */
  const confirmEntry = async (product: Product, quantity: number, large: boolean, negative: boolean, after: number) => {
    if (large && !(await ask(fill('ks.qty.confirmLarge', { qty: `${fmt(quantity, locale)} ${product.unit}` }), 'warn'))) return false;
    if (negative && !(await ask(fill('ks.qty.confirmNegative', { qty: fmt(Math.abs(after), locale) }), 'danger'))) return false;
    return true;
  };

  const loadSummary = useCallback(() => {
    fetch('/api/stock/summary').then((r) => (r.ok ? r.json() : null)).then((d) => d && setSummary(d)).catch(() => {});
  }, []);

  const load = useCallback(
    async (append = false) => {
      const id = ++requestId.current;
      if (!append) setLoading(true);
      const qs = new URLSearchParams({ take: '50', skip: String(append ? products.length : 0) });
      if (q.trim()) qs.set('q', q.trim());
      if (categoryId) qs.set('categoryId', categoryId);
      if (level) qs.set('level', level);
      try {
        const res = await fetch(`/api/stock/products?${qs}`);
        if (!res.ok) throw new Error('load');
        const data = await res.json();
        if (id !== requestId.current) return; // a newer search won
        setProducts((prev) => (append ? [...prev, ...data.products] : data.products));
        setTotal(data.total);
        setFailed(false);
      } catch {
        if (id === requestId.current) setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, categoryId, level]
  );

  useEffect(() => {
    fetch('/api/stock/categories').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCategories(d.categories)).catch(() => {});
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const timer = setTimeout(() => load(false), q ? 200 : 0);
    return () => clearTimeout(timer);
  }, [q, categoryId, level, load]);

  const applyQuantity = (productId: string, quantity: number) =>
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, quantity, level: quantity <= 0 ? 'out' : quantity <= p.minStock ? 'low' : 'ok' }
          : p
      )
    );

  const move = async (product: Product, quantity: number, reason: string, note?: string, confirmed = false): Promise<void> => {
    const plan = planEntry(product.quantity, quantity, reason);
    if (!plan.ok) {
      toast.error(t('ks.saveFailed'));
      return;
    }
    if (!confirmed && (plan.large || plan.negative)) {
      if (!(await confirmEntry(product, quantity, plan.large, plan.negative, plan.after.toNumber()))) return;
      confirmed = true;
    }
    setBusyId(product.id);
    let retry = false;
    try {
      const res = await fetch('/api/stock/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity, reason, note: note || null, confirmed }),
      });
      if (res.status === 409) {
        // The stock changed since this screen loaded: ask again with the server's numbers.
        const d = await res.json().catch(() => null);
        if (d?.code === 'CONFIRM') {
          applyQuantity(product.id, Number(d.current));
          retry = await confirmEntry(product, quantity, Boolean(d.large), Boolean(d.negative), Number(d.after));
        } else toast.error(t('ks.saveFailed'));
        return;
      }
      if (!res.ok) {
        toast.error(t(res.status === 403 ? 'ks.forbidden' : 'ks.saveFailed'));
        return;
      }
      const data = await res.json();
      applyQuantity(product.id, data.quantity);
      loadSummary();
      if (data.unchanged) {
        toast(fill('ks.qty.unchanged', { qty: `${fmt(data.quantity, locale)} ${product.unit}` }));
        return;
      }
      toast.success(fill('ks.saved', { name: product.name, quantity: fmt(data.quantity, locale) }), {
        duration: 10_000,
        action: {
          label: t('ks.undo'),
          onClick: async () => {
            const undo = await fetch(`/api/stock/movements/${data.movementId}/undo`, { method: 'POST' });
            if (!undo.ok) {
              toast.error(t('ks.undoFailed'));
              return;
            }
            const back = await undo.json();
            applyQuantity(product.id, back.quantity);
            loadSummary();
            toast(t('ks.undone'));
          },
        },
      });
    } catch {
      toast.error(t('ks.saveFailed'));
    } finally {
      setBusyId(null);
    }
    if (retry) await move(product, quantity, reason, note, true);
  };

  const tile = (key: 'low' | 'out', label: TranslationKey, value: number | undefined, tone: string) => (
    <button
      type="button"
      onClick={() => setLevel(level === key ? '' : key)}
      aria-pressed={level === key}
      className={`flex min-h-[84px] flex-col items-start justify-between rounded-xl border-2 p-3 text-left ${level === key ? 'border-slate-900' : 'border-transparent'} ${tone}`}
    >
      <span className="text-base font-medium">{t(label)}</span>
      <span className="text-3xl font-bold">{value ?? '–'}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">{t('ks.search')}</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ks.search')}
          className="h-16 w-full rounded-2xl border-2 border-slate-200 bg-white pl-14 pr-12 text-xl outline-none focus:border-teal-600"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full text-slate-400" aria-label={t('ks.staff.clear')}>
            <X className="mx-auto h-6 w-6" />
          </button>
        )}
      </label>

      {categories.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
          {[{ id: '', name: t('ks.allCategories') }, ...categories].map((c) => (
            <button
              key={c.id || 'all'}
              type="button"
              onClick={() => setCategoryId(c.id)}
              aria-pressed={categoryId === c.id}
              className={`h-11 shrink-0 rounded-full px-4 text-base font-medium ${categoryId === c.id ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 border'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {tile('low', 'ks.tile.low', summary?.low, 'bg-amber-50 text-amber-900')}
        {tile('out', 'ks.tile.out', summary?.out, 'bg-red-50 text-red-900')}
        <Link href="/kolaystok/app/movements?today=1" className="flex min-h-[84px] flex-col items-start justify-between rounded-xl bg-sky-50 p-3 text-sky-900">
          <span className="text-base font-medium">{t('ks.tile.today')}</span>
          <span className="text-3xl font-bold">{summary?.today ?? '–'}</span>
        </Link>
      </div>

      {(level === 'low' || level === 'out') && ks.permissions.orderEmail && (
        <Link href="/kolaystok/app/orders" className="flex h-14 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">
          {t('ks.order.prepare')}
        </Link>
      )}

      {failed && <p className="rounded-lg bg-red-50 p-3 text-base text-red-700">{t('ks.loadFailed')}</p>}

      <ul className="space-y-2" aria-busy={loading}>
        {products.map((p) => (
          <li key={p.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <ProductPhoto id={p.id} name={p.name} hasPhoto={p.hasPhoto} />
              <ProductLabel
                name={p.name}
                size={p.size}
                code={p.code}
                extra={p.level !== 'ok' ? fill('ks.min', { min: fmt(p.minStock, locale) }) : null}
              />
            </div>
            {ks.permissions.move ? (
              <div className="mt-3 grid grid-cols-[1fr_1.2fr_1fr] gap-2">
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => move(p, 1, ks.quickReasons.minus)}
                  className="flex h-16 items-center justify-center rounded-xl bg-slate-100 text-slate-800 active:bg-slate-200 disabled:opacity-50"
                  aria-label={`${t('ks.minus')}: ${p.name}${p.size ? ` ${p.size}` : ''}`}
                >
                  <Minus className="h-8 w-8" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className={`h-16 rounded-xl px-2 text-3xl font-bold tabular-nums ${LEVEL_STYLE[p.level]}`}
                  aria-label={`${t('ks.qty.title')}: ${p.name}${p.size ? ` ${p.size}` : ''}, ${fmt(p.quantity, locale)} ${p.unit}, ${t(`ks.level.${p.level}` as TranslationKey)}`}
                >
                  {fmt(p.quantity, locale)}
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => move(p, 1, ks.quickReasons.plus)}
                  className="flex h-16 items-center justify-center rounded-xl bg-teal-700 text-white active:bg-teal-800 disabled:opacity-50"
                  aria-label={`${t('ks.plus')}: ${p.name}${p.size ? ` ${p.size}` : ''}`}
                >
                  <Plus className="h-8 w-8" />
                </button>
              </div>
            ) : (
              <p className={`mt-3 rounded-xl py-2 text-center text-3xl font-bold tabular-nums ${LEVEL_STYLE[p.level]}`}>{fmt(p.quantity, locale)}</p>
            )}
          </li>
        ))}
      </ul>

      {!loading && products.length === 0 && !failed && <p className="py-10 text-center text-lg text-slate-500">{t('ks.empty')}</p>}
      {products.length < total && (
        <button type="button" onClick={() => load(true)} className="h-14 w-full rounded-xl border bg-white text-lg font-medium">
          {t('ks.loadMore')}
        </button>
      )}

      {editing && (
        <QuantitySheet
          product={editing}
          onClose={() => setEditing(null)}
          onSave={async (quantity, reason, note) => {
            const p = editing;
            setEditing(null);
            await move(p, quantity, reason, note);
          }}
        />
      )}

      {question && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="alertdialog" aria-modal="true" aria-label={question.text}>
          <div className="w-full rounded-t-2xl bg-white p-5 pb-8">
            <p className={`mb-5 text-2xl font-bold ${question.tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{question.text}</p>
            <div className="grid gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => answer(true)}
                className={`h-16 rounded-xl text-xl font-bold text-white ${question.tone === 'danger' ? 'bg-red-700' : 'bg-teal-700'}`}
              >
                {t('ks.qty.yes')}
              </button>
              <button type="button" onClick={() => answer(false)} className="h-16 rounded-xl bg-slate-100 text-xl font-semibold">
                {t('ks.qty.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "How many, and why" — a bottom sheet: the reason first, then a big number field. */
function QuantitySheet({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (quantity: number, reason: string, note: string) => void;
}) {
  const { t, fill, locale } = useI18n();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<string>('sale');
  const [note, setNote] = useState('');
  const value = Number(amount.replace(',', '.'));
  const plan = amount.trim() === '' ? null : planEntry(product.quantity, value, reason);
  const valid = Boolean(plan?.ok);
  const isCount = entryDirection(reason) === 'set';
  const sign = (r: string) => ({ in: '+', out: '−', set: '=' } as const)[entryDirection(r) ?? 'set'];

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label={t('ks.qty.title')} onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <ProductLabel
              large
              name={product.name}
              size={product.size}
              code={product.code}
              extra={`${fmt(product.quantity, locale)} ${product.unit}`}
            />
          </div>
          <button type="button" onClick={onClose} className="h-11 w-11 rounded-full bg-slate-100" aria-label={t('ks.qty.cancel')}>
            <X className="mx-auto h-6 w-6" />
          </button>
        </div>

        <p className="mb-1 text-base font-medium">{t('ks.qty.reason')}</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {MANUAL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={`h-12 rounded-xl text-base font-medium ${reason === r ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
            >
              {t(`ks.reason.${r}` as TranslationKey)} ({sign(r)})
            </button>
          ))}
        </div>

        <label className="mb-1 block">
          <span className="mb-1 block text-base font-medium">{t(isCount ? 'ks.qty.countAmount' : 'ks.qty.amount')}</span>
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
            className="h-16 w-full rounded-xl border-2 px-4 text-3xl font-bold tabular-nums outline-none focus:border-teal-600"
          />
        </label>
        <p className={`mb-3 min-h-[1.75rem] text-lg font-semibold ${plan?.ok && plan.negative ? 'text-red-700' : 'text-slate-700'}`} aria-live="polite">
          {plan?.ok
            ? fill('ks.qty.after', { qty: `${fmt(plan.after.toNumber(), locale)} ${product.unit}` })
            : amount.trim() !== ''
              ? t('ks.qty.positiveOnly')
              : ''}
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-base font-medium">{t('ks.qty.note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-12 w-full rounded-xl border px-3 text-lg" />
        </label>

        <button
          type="button"
          disabled={!valid}
          onClick={() => onSave(value, reason, note)}
          className="h-16 w-full rounded-xl bg-teal-700 text-xl font-bold text-white disabled:opacity-40"
        >
          {t('ks.qty.save')}
        </button>
      </div>
    </div>
  );
}

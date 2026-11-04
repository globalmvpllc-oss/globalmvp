'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';

/**
 * Movement history: who, when, how much, why. Filter by person (managers),
 * by day range, or "today". Product filtering comes from a product's link
 * (?productId=). PDF and Excel buttons arrive with day 2.
 */
export default function KsMovements() {
  const { t, locale } = useI18n();
  const ks = useKs();
  const params = useSearchParams();
  const [today, setToday] = useState(params?.get('today') === '1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [staffId, setStaffId] = useState('');
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const productId = params?.get('productId') ?? '';

  const query = useCallback(
    (skip: number) => {
      const qs = new URLSearchParams({ take: '50', skip: String(skip) });
      if (today) qs.set('today', '1');
      else {
        if (from) qs.set('from', from);
        // The API's "to" is exclusive; the screen's is the last day shown.
        if (to) qs.set('to', new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10));
      }
      if (staffId) qs.set('staffId', staffId);
      if (productId) qs.set('productId', productId);
      return qs;
    },
    [today, from, to, staffId, productId]
  );

  const load = useCallback(
    (append: boolean) => {
      fetch(`/api/stock/movements?${query(append ? rows.length : 0)}`)
        .then((r) => (r.ok ? r.json() : { movements: [], total: 0 }))
        .then((d) => { setRows((prev) => (append ? [...prev, ...d.movements] : d.movements)); setTotal(d.total); })
        .catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query]
  );

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    if (ks.permissions.settings) fetch('/api/stock/staff').then((r) => (r.ok ? r.json() : null)).then((d) => d && setPeople(d.staff)).catch(() => {});
  }, [ks.permissions.settings]);

  const when = (v: string) =>
    new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v));

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t('ks.mv.title')}</h1>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setToday(!today)} aria-pressed={today} className={`col-span-2 h-12 rounded-xl text-lg font-medium ${today ? 'bg-teal-700 text-white' : 'border bg-white'}`}>
          {t('ks.mv.today')}
        </button>
        {!today && (
          <>
            <label className="text-base">{t('ks.mv.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-12 w-full rounded-xl border bg-white px-2 text-lg" /></label>
            <label className="text-base">{t('ks.mv.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-12 w-full rounded-xl border bg-white px-2 text-lg" /></label>
          </>
        )}
        {people.length > 0 && (
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="col-span-2 h-12 rounded-xl border bg-white px-3 text-lg" aria-label={t('ks.mv.who')}>
            <option value="">{t('ks.mv.allPeople')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-lg text-slate-500">{t('ks.mv.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id} className={`rounded-xl bg-white p-3 shadow-sm ${m.undone ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{m.productName}</p>
                  <p className="text-sm text-slate-500">{m.productCode} · {when(m.createdAt)} · {m.actorName}</p>
                  <p className="text-sm">{t(`ks.reason.${m.reason}` as TranslationKey)}{m.note ? ` — ${m.note}` : ''}{m.undone ? ` (${t('ks.mv.undone')})` : ''}</p>
                </div>
                <p className={`shrink-0 text-2xl font-bold tabular-nums ${m.delta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {m.delta > 0 ? '+' : ''}{m.delta}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length < total && (
        <button type="button" onClick={() => load(true)} className="h-14 w-full rounded-xl border bg-white text-lg font-medium">{t('ks.loadMore')}</button>
      )}
    </div>
  );
}

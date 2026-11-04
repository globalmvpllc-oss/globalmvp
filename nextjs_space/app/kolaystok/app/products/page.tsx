'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { useKs } from '@/components/kolaystok/ks-context';
import { ProductPhoto } from '@/components/kolaystok/product-photo';

/** Products (manager): search, open one to edit, add a new one. */
export default function KsProducts() {
  const { t, locale } = useI18n();
  const ks = useKs();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ take: '100' });
      if (q.trim()) qs.set('q', q.trim());
      fetch(`/api/stock/products?${qs}`)
        .then((r) => (r.ok ? r.json() : { products: [], total: 0 }))
        .then((d) => { setRows(d.products); setTotal(d.total); })
        .catch(() => {});
    }, q ? 200 : 0);
    return () => clearTimeout(timer);
  }, [q]);

  const money = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: ks.currency }).format(n);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('ks.nav.products')} <span className="text-base font-normal text-slate-500">({total})</span></h1>
        {ks.permissions.products && (
          <Link href="/kolaystok/app/products/new" className="flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-4 text-lg font-semibold text-white">
            <Plus className="h-5 w-5" /> {t('ks.product.new')}
          </Link>
        )}
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ks.search')} className="h-14 w-full rounded-xl border-2 bg-white pl-12 pr-4 text-lg outline-none focus:border-teal-600" />
      </label>
      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={`/kolaystok/app/products/${p.id}`} className="flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm">
              <ProductPhoto id={p.id} name={p.name} hasPhoto={p.hasPhoto} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{p.name}</p>
                <p className="text-sm text-slate-500">{p.code}{p.categoryName ? ` · ${p.categoryName}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tabular-nums">{p.quantity}</p>
                {ks.permissions.prices && <p className="text-sm text-slate-500">{money(p.salePrice)}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { ProductPhoto } from '@/components/kolaystok/product-photo';
import { ProductLabel } from '@/components/kolaystok/product-label';

/** A product as the search returns it (see /api/stock/picker). */
export interface PickerProduct {
  id: string;
  code: string;
  name: string;
  size: string | null;
  unit: string;
  quantity: number;
  hasPhoto: boolean;
  salePrice: number | null;
  vendorId: string | null;
  suggested: number;
}

/**
 * Search by name or code (Turkish letters optional: "cember" finds "Çember"),
 * see photo, size and stock, and add with a big "+ Ekle". Used by the order
 * email and the sales quote.
 */
export function ProductPicker({ addedIds, onAdd }: { addedIds: Set<string>; onAdd: (p: PickerProduct) => void }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const fmt = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/stock/picker?q=${encodeURIComponent(term)}`);
        const data = res.ok ? await res.json() : { products: [] };
        if (id === request.current) setResults(data.products);
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ks.search')}
          aria-label={t('ks.search')}
          className="h-14 w-full rounded-xl border-2 bg-white pl-12 pr-3 text-lg outline-none focus:border-teal-600"
        />
      </label>
      {q.trim() !== '' && !loading && results.length === 0 && <p className="px-1 text-base text-slate-500">{t('ks.empty')}</p>}
      {results.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {results.map((p) => {
            const added = addedIds.has(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <ProductPhoto id={p.id} name={p.name} hasPhoto={p.hasPhoto} size={56} />
                <div className="min-w-0 flex-1">
                  <ProductLabel name={p.name} size={p.size} code={p.code} extra={`${t('ks.picker.stock')}: ${fmt(p.quantity)} ${p.unit}`} />
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(p)}
                  disabled={added}
                  className={`flex h-14 shrink-0 items-center gap-1 rounded-xl px-4 text-lg font-bold ${added ? 'bg-emerald-50 text-emerald-800' : 'bg-teal-700 text-white active:bg-teal-800'}`}
                  aria-label={`${added ? t('ks.picker.added') : t('ks.picker.add')}: ${p.name}${p.size ? ` ${p.size}` : ''}`}
                >
                  {added ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  {added ? t('ks.picker.added') : t('ks.picker.add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

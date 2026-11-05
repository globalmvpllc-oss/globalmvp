'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';
import { useKsDialog } from '@/components/kolaystok/ks-dialog';

/**
 * Add or edit a product (manager). /kolaystok/app/products/new adds; any
 * other id edits. The stock number is not edited here — it changes only
 * through movements (and the opening stock when adding).
 */
const EMPTY = {
  code: '', name: '', categoryId: '', size: '', material: '', unit: 'adet', purchasePrice: '', salePrice: '',
  minStock: '50', targetStock: '', shelf: '', vendorId: '', notes: '', openingStock: '',
};

export default function KsProductForm({ params }: { params: { id: string } }) {
  const { t, fill } = useI18n();
  const dialog = useKsDialog();
  const ks = useKs();
  const router = useRouter();
  const isNew = params.id === 'new';
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [quantity, setQuantity] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/stock/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
    fetch('/api/stock/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? [])).catch(() => {});
    if (!isNew) {
      fetch(`/api/stock/products/${encodeURIComponent(params.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (!p) return;
          setQuantity(p.quantity);
          setForm({
            code: p.code ?? '', name: p.name ?? '', categoryId: p.categoryId ?? '', size: p.size ?? '', material: p.material ?? '',
            unit: p.unit ?? 'adet', purchasePrice: p.purchasePrice ?? '', salePrice: p.salePrice ?? '', minStock: String(p.minStock ?? ''),
            targetStock: p.targetStock ?? '', shelf: p.shelf ?? '', vendorId: p.vendorId ?? '', notes: p.notes ?? '', openingStock: '',
          });
        })
        .catch(() => {});
    }
  }, [isNew, params.id]);

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      let categoryId = form.categoryId || null;
      if (newCategory.trim()) {
        const res = await fetch('/api/stock/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategory.trim() }) });
        if (res.ok) categoryId = (await res.json()).id;
      }
      const body: Record<string, unknown> = { ...form, categoryId, vendorId: form.vendorId || null };
      if (!isNew) delete body.openingStock;
      const res = await fetch(isNew ? '/api/stock/products' : `/api/stock/products/${encodeURIComponent(params.id)}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'DUPLICATE_CODE') toast.error(t('ks.product.duplicate'));
        else if (data?.code === 'PLAN_LIMIT') toast.error(fill('ks.product.limit', { limit: data.limit }));
        else toast.error(t('ks.saveFailed'));
        return;
      }
      toast.success(t('ks.product.saved'));
      router.push('/kolaystok/app/products');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await dialog.confirm(fill('ks.product.deactivateConfirm', { name: form.name }), { tone: 'danger', yes: 'ks.dialog.removeYes' }))) return;
    const res = await fetch(`/api/stock/products/${encodeURIComponent(params.id)}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('ks.product.deactivated'));
      router.push('/kolaystok/app/products');
    } else toast.error(t('ks.saveFailed'));
  };

  if (!ks.permissions.products) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const field = (key: string, label: TranslationKey, props: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="mb-1 block text-base font-medium">{t(label)}</span>
      <input value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg outline-none focus:border-teal-600" {...props} />
    </label>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.push('/kolaystok/app/products')} className="flex h-11 items-center gap-2 text-lg text-slate-600">
        <ArrowLeft className="h-5 w-5" /> {t('ks.staff.back')}
      </button>
      <h1 className="text-2xl font-bold">{t(isNew ? 'ks.product.new' : 'ks.product.edit')}</h1>
      {!isNew && quantity !== null && <p className="text-lg">{t('ks.product.stock')}: <strong>{quantity}</strong> {form.unit}</p>}

      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {field('code', 'ks.product.code', { required: true })}
        {field('name', 'ks.product.name', { required: true })}
        <label className="block">
          <span className="mb-1 block text-base font-medium">{t('ks.product.category')}</span>
          <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg">
            <option value="">{t('ks.product.none')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t('ks.product.newCategory')} className="mt-2 h-12 w-full rounded-xl border bg-white px-3 text-lg" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {field('size', 'ks.product.size')}
          {field('material', 'ks.product.material')}
          {field('unit', 'ks.product.unit')}
          {field('shelf', 'ks.product.shelf')}
          {field('purchasePrice', 'ks.product.purchasePrice', { inputMode: 'decimal' })}
          {field('salePrice', 'ks.product.salePrice', { inputMode: 'decimal' })}
          {field('minStock', 'ks.product.minStock', { inputMode: 'decimal' })}
          {field('targetStock', 'ks.product.targetStock', { inputMode: 'decimal' })}
        </div>
        {isNew && field('openingStock', 'ks.product.opening', { inputMode: 'decimal' })}
        <label className="block">
          <span className="mb-1 block text-base font-medium">{t('ks.product.supplier')}</span>
          <select value={form.vendorId} onChange={(e) => set('vendorId', e.target.value)} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg">
            <option value="">{t('ks.product.none')}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-medium">{t('ks.product.notes')}</span>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full rounded-xl border-2 bg-white p-3 text-lg" />
        </label>
        <button type="submit" disabled={saving} className="h-14 w-full rounded-xl bg-teal-700 text-xl font-bold text-white disabled:opacity-50">
          {t('ks.product.save')}
        </button>
        {!isNew && (
          <button type="button" onClick={remove} className="h-12 w-full rounded-xl border-2 border-red-200 text-lg font-medium text-red-700">
            {t('ks.product.deactivate')}
          </button>
        )}
      </form>
      {dialog.element}
    </div>
  );
}

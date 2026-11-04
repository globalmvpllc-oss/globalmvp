'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { useKs } from '@/components/kolaystok/ks-context';
import { ProductLabel } from '@/components/kolaystok/product-label';

/**
 * "Sipariş maili hazırla": critical products grouped by supplier with the
 * suggested quantity, every quantity editable. "Preview" shows the exact
 * email; only "Send" — pressed by the manager after the preview — sends it.
 * Nothing is ever sent automatically.
 */
interface Line { productId: string; code: string; name: string; size: string | null; unit: string; quantity: number }
interface Group { vendorId: string | null; vendorName: string | null; emails: string[]; lines: Line[] }

export default function KsOrders() {
  const { t, fill } = useI18n();
  const ks = useKs();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ vendorId: string; to: string[]; from: string; replyTo: string | null; subject: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/stock/orders').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((d) => {
      setGroups(d.groups);
      const q: Record<string, string> = {};
      for (const g of d.groups) for (const l of g.lines) q[l.productId] = String(l.quantity);
      setQty(q);
    }).catch(() => setFailed(true));
  }, []);

  if (!ks.permissions.orderEmail) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const body = (g: Group) => ({
    vendorId: g.vendorId,
    lines: g.lines.map((l) => ({ productId: l.productId, quantity: Number((qty[l.productId] ?? '').replace(',', '.')) })).filter((l) => l.quantity > 0),
    note: note[g.vendorId ?? ''] || null,
  });

  const showPreview = async (g: Group) => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/orders/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(g)) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(t(data?.code === 'NO_EMAIL' ? 'ks.order.noEmail' : 'ks.saveFailed')); return; }
      setPreview({ vendorId: g.vendorId!, ...data });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const g = groups?.find((x) => x.vendorId === preview?.vendorId);
    if (!g) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock/orders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body(g), confirmed: true }) });
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
      {groups === null && <p className="text-lg">{failed ? t('ks.loadFailed') : t('common.loading')}</p>}
      {groups?.length === 0 && <p className="py-8 text-center text-lg text-slate-500">{t('ks.order.none')}</p>}
      {groups?.map((g) => (
        <section key={g.vendorId ?? 'none'} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-semibold">{g.vendorName ?? t('ks.order.noSupplier')}</h2>
          {g.vendorId && <p className="break-all text-sm text-slate-500">{g.emails.join(', ') || t('ks.order.noEmail')}</p>}
          <ul className="divide-y">
            {g.lines.map((l) => (
              <li key={l.productId} className="space-y-2 py-3">
                <ProductLabel name={l.name} size={l.size} code={l.code} />
                <label className="flex items-center justify-end gap-2">
                  <input
                    inputMode="decimal"
                    value={qty[l.productId] ?? ''}
                    onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value.replace(/[^0-9.,]/g, '') })}
                    className="h-14 w-32 rounded-lg border-2 px-3 text-right text-xl tabular-nums"
                    aria-label={`${t('ks.qty.amount')}: ${l.name}${l.size ? ` ${l.size}` : ''}`}
                  />
                  <span className="text-sm text-slate-500">{l.unit}</span>
                </label>
              </li>
            ))}
          </ul>
          {g.vendorId ? (
            <>
              <textarea value={note[g.vendorId] ?? ''} onChange={(e) => setNote({ ...note, [g.vendorId!]: e.target.value })} rows={2} placeholder={t('ks.qty.note')} className="w-full rounded-xl border p-3 text-base" />
              <button type="button" onClick={() => showPreview(g)} disabled={busy || g.emails.length === 0} className="h-14 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40">
                {t('ks.order.preview')}
              </button>
            </>
          ) : (
            <p className="text-base text-slate-600">{t('ks.order.assignSupplier')}</p>
          )}
        </section>
      ))}
    </div>
  );
}

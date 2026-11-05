'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';
import { useKsDialog } from '@/components/kolaystok/ks-dialog';

/**
 * "Teklifler": KolayStok quotes with their status (Gönderildi, Kabul edildi,
 * Reddedildi; a draft that could not be sent, or one past its date, says so).
 * Download the PDF again, send it again, or mark it. "Kabul edildi" takes the
 * products out of stock once, as "Satış (−)"; going below zero asks first.
 */
interface QuoteRow {
  id: string;
  quoteNumber: string;
  status: string;
  total: number;
  currency: string;
  issueDate: string;
  validUntil: string;
  stockDeductedAt: string | null;
  customer: { name: string; companyName: string | null; email: string | null };
}

const BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-800',
  SENT: 'bg-sky-100 text-sky-900',
  ACCEPTED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-amber-100 text-amber-900',
};

export default function KsQuotes() {
  const { t, fill, locale } = useI18n();
  const ks = useKs();
  const dialog = useKsDialog();
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const money = (n: number, c: string) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: c || 'TRY' }).format(n);
  const date = (d: string) => new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
  const qtyText = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);

  const load = useCallback(() => {
    fetch('/api/stock/quotes').then((r) => (r.ok ? r.json() : { quotes: [] })).then((d) => setRows(d.quotes)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!ks.permissions.quotes) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const resend = async (q: QuoteRow) => {
    if (!(await dialog.confirm(fill('ks.quote.resendConfirm', { number: q.quoteNumber, to: q.customer.email ?? '' }), { yes: 'ks.quote.sendYes' }))) return;
    setBusy(q.id);
    try {
      const res = await fetch(`/api/stock/quotes/${q.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
      if (!res.ok) { toast.error(t('ks.quote.sendFailed')); return; }
      toast.success(fill('ks.quote.resent', { number: q.quoteNumber }));
      load();
    } finally {
      setBusy(null);
    }
  };

  const mark = async (q: QuoteRow, status: 'ACCEPTED' | 'REJECTED') => {
    const question = status === 'ACCEPTED' ? fill('ks.quote.acceptConfirm', { number: q.quoteNumber }) : fill('ks.quote.rejectConfirm', { number: q.quoteNumber });
    if (!(await dialog.confirm(question, { tone: status === 'REJECTED' ? 'danger' : 'warn', yes: status === 'ACCEPTED' ? 'ks.quote.acceptYes' : 'ks.quote.rejectYes' }))) return;
    setBusy(q.id);
    try {
      const post = (confirmed: boolean) =>
        fetch(`/api/stock/quotes/${q.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, confirmed }) });
      let res = await post(false);
      if (res.status === 409) {
        const d = await res.json().catch(() => null);
        if (d?.code !== 'CONFIRM') { toast.error(t('ks.saveFailed')); return; }
        const list = (d.negative as Array<{ code: string; name: string; after: number }>).map((n) => `${n.code} (−${qtyText(Math.abs(n.after))})`).join(', ');
        if (!(await dialog.confirm(fill('ks.qty.confirmNegative', { qty: list }), { tone: 'danger', yes: 'ks.qty.yes' }))) return;
        res = await post(true);
      }
      if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
      const data = await res.json();
      toast.success(status === 'ACCEPTED' ? fill('ks.quote.accepted', { number: q.quoteNumber, n: data.moved }) : fill('ks.quote.rejected', { number: q.quoteNumber }));
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('ks.quote.list')}</h1>
        <Link href="/kolaystok/app/quotes/new" className="flex h-12 items-center rounded-xl bg-teal-700 px-4 text-base font-semibold text-white">+ {t('ks.quote.new')}</Link>
      </div>
      {rows === null && <p className="text-lg">{t('common.loading')}</p>}
      {rows?.length === 0 && <p className="py-8 text-center text-lg text-slate-500">{t('ks.quote.none')}</p>}
      <ul className="space-y-3">
        {rows?.map((q) => {
          // A draft (not sent yet) is sent first; only sent or expired quotes are marked.
          const open = q.status === 'SENT' || q.status === 'EXPIRED';
          return (
            <li key={q.id} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold">{q.quoteNumber}</p>
                  <p className="text-base">{q.customer.name}{q.customer.companyName ? ` · ${q.customer.companyName}` : ''}</p>
                  <p className="text-sm text-slate-500">{date(q.issueDate)} · {fill('ks.quote.validUntil', { date: date(q.validUntil) })}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${BADGE[q.status] ?? BADGE.DRAFT}`}>{t(`ks.quote.status.${q.status}` as TranslationKey)}</span>
                  <p className="mt-1 text-lg font-bold tabular-nums">{money(q.total, q.currency)}</p>
                </div>
              </div>
              {q.stockDeductedAt && <p className="rounded-lg bg-emerald-50 p-2 text-base text-emerald-900">{t('ks.quote.deducted')}</p>}
              <div className="grid grid-cols-2 gap-2">
                <a href={`/api/stock/quotes/${q.id}/pdf`} className="flex h-12 items-center justify-center rounded-xl border-2 text-base font-semibold">{t('ks.quote.downloadPdf')}</a>
                <button type="button" disabled={busy === q.id || q.status === 'REJECTED'} onClick={() => resend(q)} className="h-12 rounded-xl border-2 text-base font-semibold disabled:opacity-40">{t('ks.quote.resend')}</button>
                {open && (
                  <>
                    <button type="button" disabled={busy === q.id} onClick={() => mark(q, 'ACCEPTED')} className="h-14 rounded-xl bg-emerald-700 text-lg font-bold text-white disabled:opacity-40">{t('ks.quote.markAccepted')}</button>
                    <button type="button" disabled={busy === q.id} onClick={() => mark(q, 'REJECTED')} className="h-14 rounded-xl border-2 border-red-200 text-lg font-bold text-red-700 disabled:opacity-40">{t('ks.quote.markRejected')}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {dialog.element}
    </div>
  );
}

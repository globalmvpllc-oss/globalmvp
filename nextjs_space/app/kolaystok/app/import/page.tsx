'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';

/**
 * Bulk upload with Excel (manager). Three steps on one screen:
 * 1. download the template, 2. choose the filled file → preview (every row:
 * add / update / error), 3. confirm. The same file adds new products and
 * updates stock and prices of existing ones. Nothing is written before 3.
 */
interface Row { row: number; code: string; action: 'create' | 'update'; values: Record<string, unknown>; errors: string[] }

export default function KsImport() {
  const { t, fill } = useI18n();
  const ks = useKs();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ rows: Row[]; creates: number; updates: number; errorCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ks.permissions.products) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const send = async (mode: 'preview' | 'apply') => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/stock/import?mode=${mode}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.rows) setResult(data);
        toast.error(t(data?.code === 'TOO_BIG' ? 'ks.imp.tooBig' : data?.code === 'UNREADABLE' ? 'ks.imp.unreadable' : data?.code === 'HAS_ERRORS' ? 'ks.imp.hasErrors' : 'ks.saveFailed'));
        return;
      }
      if (mode === 'preview') setResult(data);
      else {
        toast.success(fill('ks.imp.done', { created: data.created, updated: data.updated }));
        setResult(null);
        setFile(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const errorText = (code: string) => {
    const [field, kind] = code.split(':');
    return t((`ks.imp.err.${kind}` as TranslationKey)) + (field && field !== 'plan' ? ` (${field})` : '');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('ks.imp.title')}</h1>
      <p className="text-base text-slate-600">{t('ks.imp.hint')}</p>

      <a href="/api/stock/import" className="flex h-14 items-center justify-center rounded-xl border-2 border-teal-700 text-lg font-semibold text-teal-800">
        1. {t('ks.imp.template')}
      </a>

      <label className="block rounded-2xl bg-white p-4 shadow-sm">
        <span className="mb-2 block text-lg font-semibold">2. {t('ks.imp.choose')}</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          className="block w-full text-base"
        />
      </label>
      <button type="button" onClick={() => send('preview')} disabled={!file || busy} className="h-14 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40">
        {t('ks.imp.preview')}
      </button>

      {result && (
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 p-3"><p className="text-sm">{t('ks.imp.creates')}</p><p className="text-2xl font-bold">{result.creates}</p></div>
            <div className="rounded-xl bg-sky-50 p-3"><p className="text-sm">{t('ks.imp.updates')}</p><p className="text-2xl font-bold">{result.updates}</p></div>
            <div className="rounded-xl bg-red-50 p-3"><p className="text-sm">{t('ks.imp.errors')}</p><p className="text-2xl font-bold">{result.errorCount}</p></div>
          </div>
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-2xl bg-white shadow-sm">
            {result.rows.map((r) => (
              <li key={r.row} className={`p-3 ${r.errors.length ? 'bg-red-50' : ''}`}>
                <p className="text-base font-medium">
                  {fill('ks.imp.row', { n: r.row })} · {r.code || '—'} · {t(r.action === 'create' ? 'ks.imp.create' : 'ks.imp.update')}
                </p>
                {String(r.values.name ?? '') && <p className="text-sm text-slate-600">{String(r.values.name)}</p>}
                {r.errors.map((e) => <p key={e} className="text-sm font-medium text-red-700">{errorText(e)}</p>)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => send('apply')}
            disabled={busy || result.errorCount > 0 || result.creates + result.updates === 0}
            className="h-16 w-full rounded-xl bg-teal-700 text-xl font-bold text-white disabled:opacity-40"
          >
            3. {t('ks.imp.apply')}
          </button>
          {result.errorCount > 0 && <p className="text-base text-red-700">{t('ks.imp.hasErrors')}</p>}
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { checkLogoFile, optimizeLogo, LOGO_ACCEPT_ATTRIBUTE, MAX_LOGO_DATA_URL_CHARS } from '@/lib/logo';

/**
 * "Şirket bilgileri" in KolayStok settings: logo, name, address, phone,
 * email, tax office and number. The same record as CorpControl's company
 * settings; the quote PDF header is made from it. Account owner only.
 */
type Company = { name: string; logoUrl: string | null; address: string | null; city: string | null; postalCode: string | null; phone: string | null; email: string | null; taxOffice: string | null; taxNumber: string | null };
const FIELDS = ['name', 'address', 'city', 'postalCode', 'phone', 'email', 'taxOffice', 'taxNumber'] as const;
type Field = (typeof FIELDS)[number];

export function CompanyInfo() {
  const { t } = useI18n();
  const [form, setForm] = useState<Record<Field, string>>({ name: '', address: '', city: '', postalCode: '', phone: '', email: '', taxOffice: '', taxNumber: '' });
  const [logo, setLogo] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [badField, setBadField] = useState<string | null>(null);

  const apply = (c: Company | null) => {
    if (!c) return;
    setForm({ name: c.name ?? '', address: c.address ?? '', city: c.city ?? '', postalCode: c.postalCode ?? '', phone: c.phone ?? '', email: c.email ?? '', taxOffice: c.taxOffice ?? '', taxNumber: c.taxNumber ?? '' });
    setLogo(c.logoUrl ?? null);
    setLogoChanged(false);
  };

  useEffect(() => {
    fetch('/api/stock/company', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { apply(d?.company ?? null); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    const check = checkLogoFile(file);
    if (!check.ok) { toast.error(t('ks.co.logoBad')); return; }
    try {
      const optimized = await optimizeLogo(file);
      if (optimized.dataUrl.length > MAX_LOGO_DATA_URL_CHARS) { toast.error(t('ks.co.logoBad')); return; }
      setLogo(optimized.dataUrl);
      setLogoChanged(true);
    } catch {
      toast.error(t('ks.co.logoBad'));
    }
  };

  const save = async () => {
    setBusy(true);
    setBadField(null);
    try {
      const res = await fetch('/api/stock/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...(logoChanged ? { logoUrl: logo } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBadField(data?.field ?? null);
        toast.error(t(res.status === 403 ? 'ks.forbidden' : 'ks.co.invalid'));
        return;
      }
      apply(data.company);
      toast.success(t('ks.co.saved'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">{t('ks.co.title')}</h2>
      <p className="text-base text-slate-600">{t('ks.co.hint')}</p>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={t('ks.co.logo')} className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-slate-400">{t('ks.co.noLogo')}</span>}
        </div>
        <div className="grid flex-1 gap-2">
          <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-teal-700 text-base font-semibold text-teal-800">
            {t('ks.co.uploadLogo')}
            <input type="file" accept={LOGO_ACCEPT_ATTRIBUTE} className="sr-only" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {logo && (
            <button type="button" onClick={() => { setLogo(null); setLogoChanged(true); }} className="h-11 rounded-xl border text-base text-red-700">
              {t('ks.co.removeLogo')}
            </button>
          )}
        </div>
      </div>

      {FIELDS.map((f) => (
        <label key={f} className="block">
          <span className="mb-1 block text-base font-medium">{t(`ks.co.${f}` as TranslationKey)}</span>
          {f === 'address' ? (
            <textarea value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} rows={2} className={`w-full rounded-xl border-2 p-3 text-lg ${badField === f ? 'border-red-500' : ''}`} />
          ) : (
            <input
              value={form[f]}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
              inputMode={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
              className={`h-12 w-full rounded-xl border-2 px-3 text-lg ${badField === f ? 'border-red-500' : ''}`}
            />
          )}
        </label>
      ))}
      {badField && <p className="text-lg font-semibold text-red-700" role="alert">{t('ks.co.invalid')}</p>}
      <button type="button" onClick={save} disabled={busy || !form.name.trim()} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-40">
        {t('ks.qty.save')}
      </button>
    </section>
  );
}

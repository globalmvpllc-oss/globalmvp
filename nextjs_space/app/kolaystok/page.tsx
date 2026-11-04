'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Package } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';

/**
 * corpcontrol.net/kolaystok — the Avc KolayStok sign-in for managers (a
 * CorpControl account). Staff use their company's own link and a PIN.
 */
export default function KolayStokLogin() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (result?.error) {
      setError(t('ks.login.failed'));
      return;
    }
    window.location.href = '/kolaystok/app';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-teal-50 px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-6 shadow">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-white">
            <Package className="h-9 w-9" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-teal-800">{t('ks.brand')}</h1>
          <p className="text-base text-slate-600">{t('ks.tagline')}</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h2 className="text-lg font-semibold">{t('ks.login.title')}</h2>
          <label className="block">
            <span className="mb-1 block text-base">{t('ks.login.email')}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-14 w-full rounded-xl border-2 px-4 text-lg outline-none focus:border-teal-600" />
          </label>
          <label className="block">
            <span className="mb-1 block text-base">{t('ks.login.password')}</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-14 w-full rounded-xl border-2 px-4 text-lg outline-none focus:border-teal-600" />
          </label>
          {error && <p role="alert" className="text-base text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-50">
            {t('ks.login.submit')}
          </button>
        </form>
        <p className="text-center text-base text-slate-500">{t('ks.login.staffHint')}</p>
      </div>
    </div>
  );
}

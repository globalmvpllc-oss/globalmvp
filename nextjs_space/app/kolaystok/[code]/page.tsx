'use client';

import { useEffect, useState } from 'react';
import { Delete, ArrowLeft, Package } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';

/**
 * corpcontrol.net/kolaystok/<company link> — warehouse staff sign-in.
 * Two steps, big targets: pick your name, type your 4-digit PIN on a keypad.
 * After the fourth digit it signs in by itself.
 */
export default function StaffSignIn({ params }: { params: { code: string } }) {
  const { t, fill, locale } = useI18n();
  const [info, setInfo] = useState<{ companyName: string; staff: Array<{ id: string; name: string }> } | null | 'missing'>(null);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stock/public/staff?code=${encodeURIComponent(params.code)}`)
      .then((r) => (r.ok ? r.json() : 'missing'))
      .then(setInfo)
      .catch(() => setInfo('missing'));
  }, [params.code]);

  const submit = async (value: string) => {
    if (!person) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/stock/public/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: params.code, staffId: person.id, pin: value }),
      });
      if (res.ok) {
        window.location.href = '/kolaystok/app';
        return;
      }
      const body = await res.json().catch(() => ({}));
      setPin('');
      if (body?.code === 'LOCKED' && body.lockedUntil) {
        const time = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(body.lockedUntil));
        setMessage(fill('ks.staff.locked', { time }));
      } else if (body?.code === 'WRONG_PIN') {
        setMessage(fill('ks.staff.wrongPin', { left: body.attemptsLeft ?? 0 }));
      } else {
        setMessage(t('ks.loadFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  // Functional update: fast taps each count, even before the screen redraws.
  const press = (digit: string) => {
    if (busy) return;
    setPin((prev) => (prev.length >= 4 ? prev : prev + digit));
  };

  // The fourth digit signs in by itself.
  useEffect(() => {
    if (pin.length === 4 && !busy) submit(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (info === 'missing') {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center text-xl">{t('ks.staff.notFound')}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-teal-50 px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
          <Package className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xl font-bold text-teal-800">{t('ks.brand')}</p>
          <p className="text-base text-slate-600">{info?.companyName ?? ''}</p>
        </div>
      </div>

      {!person ? (
        <div className="w-full max-w-sm space-y-3">
          <h1 className="text-center text-2xl font-bold">{t('ks.staff.pickName')}</h1>
          {info && info.staff.length === 0 && <p className="text-center text-lg">{t('ks.staff.none')}</p>}
          {info?.staff.map((s) => (
            <button key={s.id} type="button" onClick={() => { setPerson(s); setMessage(null); }} className="h-16 w-full rounded-2xl bg-white text-xl font-semibold shadow">
              {s.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          <button type="button" onClick={() => { setPerson(null); setPin(''); }} className="flex h-11 items-center gap-2 text-lg text-slate-600">
            <ArrowLeft className="h-5 w-5" /> {t('ks.staff.back')}
          </button>
          <h1 className="text-center text-2xl font-bold">{person.name}</h1>
          <p className="text-center text-lg">{t('ks.staff.enterPin')}</p>
          <div className="flex justify-center gap-3" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-5 w-5 rounded-full ${i < pin.length ? 'bg-teal-700' : 'bg-slate-300'}`} />
            ))}
          </div>
          {message && <p role="alert" className="text-center text-lg font-medium text-red-600">{message}</p>}
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} type="button" disabled={busy} onClick={() => press(d)} className="h-20 rounded-2xl bg-white text-3xl font-bold shadow active:bg-slate-100">
                {d}
              </button>
            ))}
            <span />
            <button type="button" disabled={busy} onClick={() => press('0')} className="h-20 rounded-2xl bg-white text-3xl font-bold shadow active:bg-slate-100">0</button>
            <button type="button" onClick={() => setPin((prev) => prev.slice(0, -1))} className="flex h-20 items-center justify-center rounded-2xl text-slate-600" aria-label={t('ks.staff.clear')}>
              <Delete className="h-8 w-8" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

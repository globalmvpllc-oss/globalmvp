'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';

/**
 * KolayStok's own question window — big buttons, at the bottom of the screen,
 * reachable with one thumb. Used instead of the browser's confirm / alert /
 * prompt boxes, which are small, cannot be styled or translated, and block
 * the page.
 *
 *   const dialog = useKsDialog();
 *   if (!(await dialog.confirm(text, { tone: 'danger' }))) return;
 *   const pin = await dialog.askPin(t('ks.set.newPin'));
 *   ...
 *   return <>{...}{dialog.element}</>;
 */
type Tone = 'neutral' | 'warn' | 'danger';

interface ConfirmOptions {
  tone?: Tone;
  yes?: TranslationKey;
  no?: TranslationKey;
}

type Pending =
  | { kind: 'confirm'; text: string; options: ConfirmOptions; resolve: (yes: boolean) => void }
  | { kind: 'pin'; text: string; resolve: (pin: string | null) => void };

const YES_STYLE: Record<Tone, string> = {
  neutral: 'bg-teal-700',
  warn: 'bg-teal-700',
  danger: 'bg-red-700',
};

export function useKsDialog() {
  const { t } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');

  const confirm = useCallback(
    (text: string, options: ConfirmOptions = {}) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', text, options, resolve })),
    []
  );

  /** A 4-digit PIN: digits only, OK only when all four are there. Null when cancelled. */
  const askPin = useCallback(
    (text: string) =>
      new Promise<string | null>((resolve) => {
        setPin('');
        setPending({ kind: 'pin', text, resolve });
      }),
    []
  );

  const close = (value: boolean | string | null) => {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(value === true);
    else pending.resolve(typeof value === 'string' ? value : null);
    setPending(null);
  };

  let element: ReactNode = null;
  if (pending) {
    const tone = pending.kind === 'confirm' ? pending.options.tone ?? 'neutral' : 'neutral';
    const pinReady = /^\d{4}$/.test(pin);
    element = (
      <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="alertdialog" aria-modal="true" aria-label={pending.text}>
        <div className="w-full rounded-t-2xl bg-white p-5 pb-8">
          <p className={`mb-5 text-2xl font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{pending.text}</p>
          {pending.kind === 'pin' && (
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter' && pinReady) close(pin); }}
              aria-label={t('ks.set.pin')}
              className="mb-4 h-20 w-full rounded-2xl border-2 px-4 text-center text-4xl font-bold tracking-[0.5em] tabular-nums outline-none focus:border-teal-600"
            />
          )}
          <div className="grid gap-3">
            <button
              type="button"
              autoFocus={pending.kind === 'confirm'}
              disabled={pending.kind === 'pin' && !pinReady}
              onClick={() => close(pending.kind === 'pin' ? pin : true)}
              className={`h-16 rounded-xl text-xl font-bold text-white disabled:opacity-40 ${YES_STYLE[tone]}`}
            >
              {pending.kind === 'pin' ? t('ks.qty.save') : t(pending.options.yes ?? 'ks.dialog.yes')}
            </button>
            <button type="button" onClick={() => close(pending.kind === 'pin' ? null : false)} className="h-16 rounded-xl bg-slate-100 text-xl font-semibold">
              {pending.kind === 'confirm' ? t(pending.options.no ?? 'ks.qty.cancel') : t('ks.qty.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return { confirm, askPin, element };
}

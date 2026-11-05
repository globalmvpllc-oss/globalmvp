'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';
import { useKsDialog } from '@/components/kolaystok/ks-dialog';
import { INCREASE_REASONS, DECREASE_REASONS, isResetWord } from '@/lib/stock/rules';

/**
 * KolayStok settings (manager). One section per job, each with one clear
 * action: usage mode, people & PINs, one-tap reasons, alert recipients,
 * Telegram, sender address, Excel, backups, and "reset all stock".
 */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="text-base text-slate-600">{hint}</p>}
      {children}
    </section>
  );
}

export default function KsSettings() {
  const { t, fill, locale } = useI18n();
  const dialog = useKsDialog();
  const ks = useKs();
  const [settings, setSettings] = useState<any>(null);
  const [staff, setStaff] = useState<Array<{ id: string; name: string; role: string; locked: boolean }>>([]);
  const [max, setMax] = useState(5);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [emails, setEmails] = useState('');
  const [sender, setSender] = useState<any>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [backups, setBackups] = useState<Array<{ id: string; day: string }>>([]);
  const [reset, setReset] = useState<{ undoUntil: string | null } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetWord, setResetWord] = useState('');

  const load = useCallback(() => {
    fetch('/api/stock/settings').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setSettings(d); setEmails((d.alertEmails ?? []).join(', ')); } }).catch(() => {});
    fetch('/api/stock/staff').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setStaff(d.staff); setMax(d.max); } }).catch(() => {});
    fetch('/api/stock/sender').then((r) => (r.ok ? r.json() : null)).then((d) => d && setSender(d)).catch(() => {});
    fetch('/api/stock/backups').then((r) => (r.ok ? r.json() : null)).then((d) => d && setBackups(d.backups)).catch(() => {});
    if (ks.permissions.reset) fetch('/api/stock/reset').then((r) => (r.ok ? r.json() : null)).then((d) => d && setReset(d)).catch(() => {});
  }, [ks.permissions.reset]);
  useEffect(() => { load(); }, [load]);

  if (!ks.permissions.settings) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const put = async (url: string, body: unknown, method = 'PUT') => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(t(data?.code === 'STAFF_LIMIT' ? 'ks.set.limitShort' : data?.code === 'OWNER_ONLY' ? 'ks.set.ownerOnly' : 'ks.saveFailed'));
    else toast.success(t('ks.set.saved'));
    load();
    return res.ok ? data : null;
  };

  const link = settings?.staffCode ? `${window.location.origin}/kolaystok/${settings.staffCode}` : null;
  const day = (v: string) => new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(v));

  const connectTelegram = async () => {
    const res = await fetch('/api/stock/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: ks.name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(t(data?.code === 'NOT_CONFIGURED' ? 'ks.tg.notConfigured' : 'ks.saveFailed')); return; }
    window.open(data.url, '_blank', 'noopener');
    toast(t('ks.tg.openHint'));
  };

  const doReset = async () => {
    const res = await fetch('/api/stock/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: resetPassword, confirm: resetWord }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(t(data?.code === 'WRONG_PASSWORD' ? 'ks.reset.wrongPassword' : data?.code === 'CONFIRM_WORD' ? 'ks.reset.typeWord' : data?.code === 'BACKUP_UNAVAILABLE' ? 'ks.reset.backupUnavailable' : 'ks.saveFailed'));
      return;
    }
    toast.success(fill('ks.reset.done', { n: data.changed }));
    setResetPassword(''); setResetWord('');
    load();
  };

  const undoReset = async () => {
    if (!(await dialog.confirm(t('ks.reset.undoConfirm'), { tone: 'warn', yes: 'ks.reset.undoYes' }))) return;
    const data = await put('/api/stock/reset/undo', undefined, 'POST');
    if (data) toast.success(fill('ks.reset.undone', { n: data.restored }));
  };

  const reasonSelect = (key: 'quickPlusReason' | 'quickMinusReason', label: TranslationKey) => (
    <label className="block">
      <span className="mb-1 block text-base font-medium">{t(label)}</span>
      <select value={settings?.[key] ?? ''} onChange={(e) => put('/api/stock/settings', { [key]: e.target.value })} className="h-12 w-full rounded-xl border-2 bg-white px-3 text-lg">
        {(key === 'quickPlusReason' ? INCREASE_REASONS : DECREASE_REASONS).map((r) => <option key={r} value={r}>{t(`ks.reason.${r}` as TranslationKey)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('ks.set.title')}</h1>

      {settings?.canChangeMode && (
        <Section title={t('ks.mode.title')} hint={t('ks.mode.hint')}>
          <div className="grid gap-2">
            {(['finance', 'stock', 'both'] as const).map((m) => (
              <button key={m} type="button" onClick={() => put('/api/stock/settings', { usageMode: m })} aria-pressed={settings.usageMode === m}
                className={`h-14 rounded-xl text-left px-4 text-lg font-medium ${settings.usageMode === m ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>
                {t(`ks.mode.${m}` as TranslationKey)}
              </button>
            ))}
          </div>
          <a href="/settings" className="mt-3 flex h-12 items-center justify-center rounded-xl border-2 text-lg font-medium">{t('ks.mode.account')}</a>
        </Section>
      )}

      <Section title={t('ks.set.staff')} hint={fill('ks.set.staffHint', { max })}>
        {link && (
          <div className="rounded-xl bg-teal-50 p-3">
            <p className="text-base font-medium">{t('ks.set.link')}</p>
            <p className="break-all text-lg font-semibold text-teal-800">{link}</p>
            <p className="text-sm text-slate-600">{t('ks.set.linkHint')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => { navigator.clipboard?.writeText(link); toast.success(t('ks.set.copied')); }} className="h-11 rounded-xl bg-teal-700 px-4 text-base font-semibold text-white">{t('ks.set.copy')}</button>
              <button type="button" onClick={async () => { if ((await dialog.confirm(t('ks.set.renewConfirm'), { tone: 'warn', yes: 'ks.set.renewYes' })) && (await put('/api/stock/staff/link', undefined, 'POST'))) toast.success(t('ks.set.renewed')); }} className="h-11 rounded-xl border-2 border-teal-700 px-4 text-base font-semibold text-teal-800">{t('ks.set.renewLink')}</button>
            </div>
          </div>
        )}
        {!settings?.canManageStaff && <p className="rounded-xl bg-slate-100 p-3 text-base text-slate-700">{t('ks.set.ownerOnly')}</p>}
        <ul className="divide-y rounded-xl border">
          {staff.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <p className="text-lg font-semibold">{s.name} <span className="text-base font-normal text-slate-500">· {t(s.role === 'manager' ? 'ks.set.role.manager' : 'ks.set.role.staff')}</span>{s.locked && <span className="ml-2 rounded bg-red-100 px-2 text-sm text-red-700">{t('ks.set.locked')}</span>}</p>
              <div className="flex flex-wrap gap-2">
                {settings?.canManageStaff && (
                  <>
                    <button type="button" onClick={async () => { const p = await dialog.askPin(fill('ks.set.newPinFor', { name: s.name })); if (p && /^\d{4}$/.test(p)) put(`/api/stock/staff/${s.id}`, { pin: p }); }} className="h-11 rounded-xl border px-3 text-base">{t('ks.set.newPin')}</button>
                    <button type="button" onClick={() => put(`/api/stock/staff/${s.id}`, { role: s.role === 'manager' ? 'staff' : 'manager' })} className="h-11 rounded-xl border px-3 text-base">{t(s.role === 'manager' ? 'ks.set.role.staff' : 'ks.set.role.manager')}</button>
                  </>
                )}
                {s.locked && <button type="button" onClick={() => put(`/api/stock/staff/${s.id}`, { unlock: true })} className="h-11 rounded-xl border px-3 text-base">{t('ks.set.unlock')}</button>}
                <button type="button" onClick={async () => { if (await dialog.confirm(fill('ks.set.signOutConfirm', { name: s.name }), { tone: 'warn', yes: 'ks.set.signOutYes' })) put(`/api/stock/staff/${s.id}`, { signOut: true }); }} className="h-11 rounded-xl border px-3 text-base">{t('ks.set.signOut')}</button>
                {settings?.canManageStaff && <button type="button" onClick={async () => { if (await dialog.confirm(fill('ks.set.removeConfirm', { name: s.name }), { tone: 'danger', yes: 'ks.dialog.removeYes' })) put(`/api/stock/staff/${s.id}`, undefined, 'DELETE'); }} className="h-11 rounded-xl border border-red-200 px-3 text-base text-red-700">{t('ks.set.remove')}</button>}
              </div>
            </li>
          ))}
        </ul>
        {settings?.canManageStaff && staff.length < max && (
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await put('/api/stock/staff', { name, pin, role }, 'POST')) { setName(''); setPin(''); setRole('staff'); } }}>
            <h3 className="text-lg font-semibold">{t('ks.set.addPerson')}</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ks.set.name')} required maxLength={60} className="h-12 w-full rounded-xl border-2 px-3 text-lg" />
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={t('ks.set.pin')} inputMode="numeric" required className="h-12 w-full rounded-xl border-2 px-3 text-lg tracking-widest" />
            <div className="grid grid-cols-2 gap-2">
              {(['staff', 'manager'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} className={`h-12 rounded-xl text-base font-medium ${role === r ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>{t(r === 'manager' ? 'ks.set.role.manager' : 'ks.set.role.staff')}</button>
              ))}
            </div>
            <button type="submit" disabled={!name.trim() || pin.length !== 4} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-40">{t('ks.set.addPerson')}</button>
          </form>
        )}
      </Section>

      <Section title={t('ks.set.quick')} hint={t('ks.set.quickHint')}>
        {reasonSelect('quickPlusReason', 'ks.set.quickPlus')}
        {reasonSelect('quickMinusReason', 'ks.set.quickMinus')}
      </Section>

      <Section title={t('ks.set.alerts')} hint={t('ks.set.alertsHint')}>
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="depo@firma.com, patron@firma.com" className="w-full rounded-xl border-2 p-3 text-lg" />
        <button type="button" onClick={() => put('/api/stock/settings', { alertEmails: emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) })} className="h-12 w-full rounded-xl bg-teal-700 text-lg font-semibold text-white">{t('ks.qty.save')}</button>

        <h3 className="pt-2 text-lg font-semibold">Telegram</h3>
        {settings?.telegram?.chats?.length ? (
          <ul className="divide-y rounded-xl border">
            {settings.telegram.chats.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3">
                <span className="text-base">{c.name || 'Telegram'}</span>
                <button type="button" onClick={() => put(`/api/stock/telegram/${c.id}`, undefined, 'DELETE')} className="h-10 rounded-lg border px-3 text-base text-red-700">{t('ks.tg.disconnect')}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-slate-600">{t('ks.tg.none')}</p>
        )}
        <button type="button" onClick={connectTelegram} disabled={!settings?.telegram?.configured} className="h-12 w-full rounded-xl bg-sky-600 text-lg font-semibold text-white disabled:opacity-40">{t('ks.tg.connect')}</button>
        <p className="text-sm text-slate-500">{t('ks.tg.connectHint')}</p>
      </Section>

      <Section title={t('ks.sender.title')} hint={fill('ks.sender.hint', { address: sender?.inUse ?? 'stok@corpcontrol.net' })}>
        {sender?.senderEmail && (
          <div className="rounded-xl bg-slate-50 p-3 text-base">
            <p><strong>{sender.senderEmail}</strong> · {t(sender.verified ? 'ks.sender.verified' : 'ks.sender.pending')}</p>
            {!sender.verified && sender.records?.length > 0 && (
              <>
                <p className="mt-2 text-sm text-slate-600">{t('ks.sender.dns')}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {sender.records.map((r: any, i: number) => <li key={i} className="break-all font-mono">{r.type} {r.name} → {r.value}</li>)}
                </ul>
              </>
            )}
            <div className="mt-2 flex gap-2">
              {!sender.verified && <button type="button" onClick={async () => { const d = await put('/api/stock/sender', undefined, 'PUT'); if (d) setSender({ ...sender, ...d }); }} className="h-11 rounded-xl border px-3 text-base">{t('ks.sender.check')}</button>}
              <button type="button" onClick={() => put('/api/stock/sender', undefined, 'DELETE')} className="h-11 rounded-xl border px-3 text-base">{t('ks.sender.useDefault')}</button>
            </div>
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); put('/api/stock/sender', { email: senderEmail }, 'POST').then(() => setSenderEmail('')); }}>
          <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="stok@firmaniz.com" className="h-12 min-w-0 flex-1 rounded-xl border-2 px-3 text-lg" />
          <button type="submit" disabled={!senderEmail} className="h-12 rounded-xl bg-teal-700 px-4 text-base font-semibold text-white disabled:opacity-40">{t('ks.qty.save')}</button>
        </form>
      </Section>

      <Section title={t('ks.xl.title')}>
        <div className="grid gap-2">
          <a href="/api/stock/export?scope=all" className="flex h-12 items-center justify-center rounded-xl border-2 text-lg font-medium">{t('ks.xl.all')}</a>
          <a href="/api/stock/export?scope=critical" className="flex h-12 items-center justify-center rounded-xl border-2 text-lg font-medium">{t('ks.xl.critical')}</a>
          <Link href="/kolaystok/app/import" className="flex h-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">{t('ks.imp.title')}</Link>
        </div>
      </Section>

      <Section title={t('ks.bk.title')} hint={t('ks.bk.hint')}>
        {backups.length === 0 ? <p className="text-base text-slate-600">{t('ks.bk.none')}</p> : (
          <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
            {backups.map((b) => (
              <li key={b.id}><a href={`/api/stock/backups/${b.id}`} className="flex h-12 items-center px-3 text-base text-teal-800 underline">{day(b.day)}</a></li>
            ))}
          </ul>
        )}
      </Section>

      {ks.permissions.reset && (
        <Section title={t('ks.reset.title')} hint={t('ks.reset.hint')}>
          {reset?.undoUntil && (
            <button type="button" onClick={undoReset} className="h-14 w-full rounded-xl bg-amber-500 text-lg font-bold text-white">
              {fill('ks.reset.undoUntil', { time: new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(reset.undoUntil)) })}
            </button>
          )}
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); doReset(); }}>
            <input type="password" autoComplete="current-password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder={t('ks.reset.password')} className="h-12 w-full rounded-xl border-2 px-3 text-lg" />
            <input value={resetWord} onChange={(e) => setResetWord(e.target.value)} placeholder={t('ks.reset.wordPlaceholder')} autoCapitalize="characters" className="h-12 w-full rounded-xl border-2 px-3 text-lg tracking-widest" />
            <button type="submit" disabled={!resetPassword || !isResetWord(resetWord)} className="h-14 w-full rounded-xl bg-red-600 text-lg font-bold text-white disabled:opacity-40">{t('ks.reset.button')}</button>
          </form>
        </Section>
      )}
      {dialog.element}
    </div>
  );
}

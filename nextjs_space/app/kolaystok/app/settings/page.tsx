'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { useKs } from '@/components/kolaystok/ks-context';

/**
 * KolayStok settings (manager). Day 1: people and PINs, and the staff link.
 * Alerts, Telegram, sender address, backups and reset arrive with day 2.
 */
export default function KsSettings() {
  const { t, fill } = useI18n();
  const ks = useKs();
  const [staff, setStaff] = useState<Array<{ id: string; name: string; role: string; locked: boolean }>>([]);
  const [max, setMax] = useState(5);
  const [staffCode, setStaffCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');

  const load = useCallback(() => {
    fetch('/api/stock/staff').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setStaff(d.staff); setMax(d.max); } }).catch(() => {});
    fetch('/api/stock/me').then((r) => (r.ok ? r.json() : null)).then((d) => d && setStaffCode(d.staffCode)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!ks.permissions.settings) return <p className="p-6 text-lg">{t('ks.forbidden')}</p>;

  const link = staffCode ? `${window.location.origin}/kolaystok/${staffCode}` : null;

  const add = async () => {
    const res = await fetch('/api/stock/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin, role }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.code === 'STAFF_LIMIT' ? fill('ks.set.limit', { max }) : t('ks.saveFailed'));
      return;
    }
    setName(''); setPin(''); setRole('staff');
    toast.success(t('ks.set.saved'));
    load();
  };

  const update = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/stock/staff/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    toast[res.ok ? 'success' : 'error'](t(res.ok ? 'ks.set.saved' : 'ks.saveFailed'));
    load();
  };

  const remove = async (id: string, who: string) => {
    if (!window.confirm(fill('ks.set.removeConfirm', { name: who }))) return;
    const res = await fetch(`/api/stock/staff/${id}`, { method: 'DELETE' });
    toast[res.ok ? 'success' : 'error'](t(res.ok ? 'ks.set.saved' : 'ks.saveFailed'));
    load();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('ks.set.title')}</h1>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{t('ks.set.staff')}</h2>
        <p className="text-base text-slate-600">{fill('ks.set.staffHint', { max })}</p>

        {link && (
          <div className="rounded-xl bg-teal-50 p-3">
            <p className="text-base font-medium">{t('ks.set.link')}</p>
            <p className="break-all text-lg font-semibold text-teal-800">{link}</p>
            <p className="text-sm text-slate-600">{t('ks.set.linkHint')}</p>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(link); toast.success(t('ks.set.copied')); }} className="mt-2 h-11 rounded-xl bg-teal-700 px-4 text-base font-semibold text-white">
              {t('ks.set.copy')}
            </button>
          </div>
        )}

        <ul className="divide-y rounded-xl border">
          {staff.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-semibold">{s.name} <span className="text-base font-normal text-slate-500">· {t(s.role === 'manager' ? 'ks.set.role.manager' : 'ks.set.role.staff')}</span>{s.locked ? <span className="ml-2 rounded bg-red-100 px-2 text-sm text-red-700">{t('ks.set.locked')}</span> : null}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { const p = window.prompt(t('ks.set.newPin')); if (p && /^\d{4}$/.test(p)) update(s.id, { pin: p }); }} className="h-11 rounded-xl border px-3 text-base">{t('ks.set.newPin')}</button>
                <button type="button" onClick={() => update(s.id, { role: s.role === 'manager' ? 'staff' : 'manager' })} className="h-11 rounded-xl border px-3 text-base">
                  {t(s.role === 'manager' ? 'ks.set.role.staff' : 'ks.set.role.manager')}
                </button>
                {s.locked && <button type="button" onClick={() => update(s.id, { unlock: true })} className="h-11 rounded-xl border px-3 text-base">{t('ks.set.unlock')}</button>}
                <button type="button" onClick={() => remove(s.id, s.name)} className="h-11 rounded-xl border border-red-200 px-3 text-base text-red-700">{t('ks.set.remove')}</button>
              </div>
            </li>
          ))}
        </ul>

        {staff.length < max && (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <h3 className="text-lg font-semibold">{t('ks.set.addPerson')}</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ks.set.name')} required maxLength={60} className="h-12 w-full rounded-xl border-2 px-3 text-lg" />
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={t('ks.set.pin')} inputMode="numeric" required pattern="\d{4}" className="h-12 w-full rounded-xl border-2 px-3 text-lg tracking-widest" />
            <div className="grid grid-cols-2 gap-2">
              {(['staff', 'manager'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} className={`h-12 rounded-xl text-base font-medium ${role === r ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>
                  {t(r === 'manager' ? 'ks.set.role.manager' : 'ks.set.role.staff')}
                </button>
              ))}
            </div>
            <button type="submit" disabled={!name.trim() || pin.length !== 4} className="h-14 w-full rounded-xl bg-teal-700 text-lg font-bold text-white disabled:opacity-40">{t('ks.set.addPerson')}</button>
          </form>
        )}
      </section>
    </div>
  );
}

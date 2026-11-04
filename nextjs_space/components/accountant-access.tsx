'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserCheck, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';

/**
 * Settings → Accountant access (Mali müşavir).
 *
 * One clear step: type the accountant's email, send the invitation. Below it,
 * who has access (remove in one click), invitations still waiting, and what
 * accountants did recently (sign-ins and downloads, from the audit log).
 * Renders nothing for a member who may not manage access.
 */
interface Data {
  members: Array<{ id: string; name: string | null; email: string; since: string }>;
  invites: Array<{ id: string; email: string; expiresAt: string }>;
  activity: Array<{ id: string; createdAt: string; actorEmail: string; action: string; metadata: any }>;
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  INVALID_EMAIL: 'acc.invalidEmail',
  OWN_EMAIL: 'acc.ownEmail',
  ALREADY_MEMBER: 'acc.alreadyMember',
};

export function AccountantAccess() {
  const { t, fill, locale } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/company/accountants');
      if (res.status === 403) {
        setHidden(true);
        return;
      }
      if (!res.ok) throw new Error('load');
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/company/accountants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(t(ERROR_KEYS[body?.code] ?? 'acc.inviteFailed'));
        return;
      }
      toast[body?.emailSent ? 'success' : 'error'](t(body?.emailSent ? 'acc.inviteSent' : 'acc.inviteNoMail'));
      setEmail('');
      load();
    } catch {
      toast.error(t('acc.inviteFailed'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string, kind: 'member' | 'invite', who: string) => {
    if (kind === 'member' && !window.confirm(fill('acc.removeConfirm', { email: who }))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/company/accountants/${encodeURIComponent(id)}?kind=${kind}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('remove');
      toast.success(t(kind === 'member' ? 'acc.removed' : 'acc.inviteCancelled'));
      load();
    } catch {
      toast.error(t('acc.page.failed'));
    } finally {
      setBusyId(null);
    }
  };

  const describe = (row: Data['activity'][number]) => {
    const kind = row.action.replace('accountant.', '');
    if (kind === 'download') {
      const what = t((`acc.what.${row.metadata?.kind}` as TranslationKey)) || String(row.metadata?.kind ?? '');
      return fill('acc.event.download', { what });
    }
    if (kind === 'invited') return fill('acc.event.invited', { email: String(row.metadata?.email ?? '') });
    return t(`acc.event.${kind}` as TranslationKey);
  };

  if (hidden) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-lg">{t('acc.title')}</CardTitle>
        </div>
        <CardDescription className="text-base">{t('acc.intro')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite(); }}
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="accountant-email" className="text-base">{t('acc.emailLabel')}</Label>
            <Input
              id="accountant-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="musavir@ornek.com"
              className="h-12 text-lg"
            />
          </div>
          <Button type="submit" size="lg" disabled={sending || !email.trim()} className="w-full sm:w-auto">
            <Send className="mr-2 h-4 w-4" aria-hidden="true" /> {t('acc.invite')}
          </Button>
        </form>

        {failed && <p className="text-base text-red-600">{t('acc.loadFailed')}</p>}

        {data && (
          <>
            <section className="space-y-2">
              <h3 className="text-base font-semibold">{t('acc.active')}</h3>
              {data.members.length === 0 ? (
                <p className="text-base text-muted-foreground">{t('acc.none')}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.members.map((m) => (
                    <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-medium">{m.name || m.email}</p>
                        <p className="text-sm text-muted-foreground">{m.email} · {fill('acc.since', { date: date(m.since) })}</p>
                      </div>
                      <Button variant="outline" onClick={() => remove(m.id, 'member', m.email)} disabled={busyId === m.id} className="w-full sm:w-auto">
                        <Trash2 className="mr-2 h-4 w-4 text-red-500" aria-hidden="true" /> {t('acc.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.invites.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-base font-semibold">{t('acc.pending')}</h3>
                <ul className="divide-y rounded-lg border">
                  {data.invites.map((i) => (
                    <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-medium">{i.email}</p>
                        <p className="text-sm text-muted-foreground">{fill('acc.expires', { date: date(i.expiresAt) })}</p>
                      </div>
                      <Button variant="ghost" onClick={() => remove(i.id, 'invite', i.email)} disabled={busyId === i.id} className="w-full sm:w-auto">
                        {t('acc.cancelInvite')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-base font-semibold">{t('acc.activity')}</h3>
              {data.activity.length === 0 ? (
                <p className="text-base text-muted-foreground">{t('acc.noActivity')}</p>
              ) : (
                <ul className="space-y-1">
                  {data.activity.map((row) => (
                    <li key={row.id} className="flex flex-col text-base sm:flex-row sm:gap-3">
                      <span className="w-36 shrink-0 text-muted-foreground">{dateTime(row.createdAt)}</span>
                      <span className="font-medium">{row.actorEmail}</span>
                      <span>{describe(row)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

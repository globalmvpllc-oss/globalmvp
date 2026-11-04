'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import { withCallbackUrl } from '@/lib/safe-redirect';
import { PASSWORD_MIN } from '@/lib/validation';
import { writeActiveCompanyCookie } from '@/lib/active-company';
import type { TranslationKey } from '@/lib/i18n';

/**
 * The accountant's invitation page — /invite/{token}.
 *
 * Exactly one next step for each situation:
 *   signed in as the invited address → "Accept invitation"
 *   signed in as someone else        → "Sign out" (the invitation names an address)
 *   not signed in, account exists    → "Sign in", then back here
 *   not signed in, no account        → a short form: name and password
 * Expired, used or cancelled invitations say so and offer nothing to press.
 */
interface Info {
  state: 'usable' | 'expired' | 'used' | 'revoked' | 'invalid';
  companyName?: string;
  email?: string;
  accountExists?: boolean;
  signedInEmail?: string | null;
}

const STATE_KEYS: Record<string, TranslationKey> = {
  expired: 'acc.page.expired',
  used: 'acc.page.used',
  revoked: 'acc.page.revoked',
  invalid: 'acc.page.invalid',
};

export default function InvitePage({ params }: { params: { token: string } }) {
  const { t, fill } = useI18n();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const token = params.token;
  const here = `/invite/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/accountant/public/invite?token=${encodeURIComponent(token)}`);
      setInfo(res.ok ? await res.json() : { state: 'invalid' });
    } catch {
      setInfo({ state: 'invalid' });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const enter = (companyId: string) => {
    writeActiveCompanyCookie(companyId);
    window.location.href = '/dashboard';
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accountant/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t(STATE_KEYS[body?.code] ?? 'acc.page.failed'));
        return;
      }
      enter(body.companyId);
    } catch {
      setError(t('acc.page.failed'));
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accountant/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.code === 'ACCOUNT_EXISTS') {
          load();
          return;
        }
        setError(t(STATE_KEYS[body?.code] ?? 'acc.page.failed'));
        return;
      }
      const signed = await signIn('credentials', { email: body.email, password, redirect: false });
      if (signed?.error) {
        window.location.href = withCallbackUrl('/auth/login', '/dashboard');
        return;
      }
      enter(body.companyId);
    } catch {
      setError(t('acc.page.failed'));
    } finally {
      setBusy(false);
    }
  };

  const sameAccount =
    info?.signedInEmail && info.email && info.signedInEmail.trim().toLowerCase() === info.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">{t('acc.page.title')}</CardTitle>
          {info?.state === 'usable' && (
            <CardDescription className="text-lg leading-relaxed text-foreground">
              {fill('acc.page.body', { company: info.companyName ?? '' })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-lg">
          {!info && <p className="text-muted-foreground">{t('acc.page.loading')}</p>}

          {info && info.state !== 'usable' && <p>{t(STATE_KEYS[info.state] ?? 'acc.page.invalid')}</p>}

          {info?.state === 'usable' && sameAccount && (
            <Button size="lg" className="h-12 w-full text-lg" onClick={accept} disabled={busy}>
              {t('acc.page.accept')}
            </Button>
          )}

          {info?.state === 'usable' && info.signedInEmail && !sameAccount && (
            <>
              <p>{fill('acc.page.wrongAccount', { email: info.email ?? '' })}</p>
              <Button size="lg" variant="outline" className="h-12 w-full text-lg" onClick={() => signOut({ callbackUrl: here })}>
                {t('acc.page.signOut')}
              </Button>
            </>
          )}

          {info?.state === 'usable' && !info.signedInEmail && info.accountExists && (
            <>
              <p>{t('acc.page.loginFirst')}</p>
              <Button asChild size="lg" className="h-12 w-full text-lg">
                <Link href={withCallbackUrl('/auth/login', here)}>{t('acc.page.login')}</Link>
              </Button>
            </>
          )}

          {info?.state === 'usable' && !info.signedInEmail && !info.accountExists && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); register(); }}>
              <h2 className="text-xl font-semibold">{t('acc.page.create')}</h2>
              <div className="space-y-2">
                <Label htmlFor="invite-email" className="text-base">{t('acc.page.email')}</Label>
                <Input id="invite-email" value={info.email ?? ''} readOnly className="h-12 bg-muted text-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-name" className="text-base">{t('acc.page.name')}</Label>
                <Input id="invite-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-lg" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password" className="text-base">{fill('acc.page.password', { min: PASSWORD_MIN })}</Label>
                <Input
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 text-lg"
                  required
                />
              </div>
              <Button type="submit" size="lg" className="h-12 w-full text-lg" disabled={busy || !name.trim() || password.length < PASSWORD_MIN}>
                {t('acc.page.submit')}
              </Button>
            </form>
          )}

          {error && <p role="alert" className="text-base text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

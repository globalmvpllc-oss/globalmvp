'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Mail, Lock } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { GoogleSignInButton } from '@/components/google-signin-button';
import { safeRedirectPath, withCallbackUrl } from '@/lib/safe-redirect';

/**
 * `useSearchParams` makes this page dynamic. Without saying so, `next build`
 * refuses to prerender it and fails the whole build rather than shipping a page
 * whose HTML would be wrong for half its visitors.
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Where to go once signed in.
   *
   * Usually the dashboard, which is what this always did. But a visitor who
   * pressed Upgrade on the public pricing arrives here with the plan they chose
   * in `callbackUrl`, and dropping them on the dashboard instead loses the
   * thing they came to do. Validated rather than trusted — see safeRedirectPath;
   * anything that is not an internal path falls back to the dashboard.
   */
  const callbackUrl = searchParams.get('callbackUrl');
  const destination = safeRedirectPath(callbackUrl, '/dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [oauthErrorCode, setOauthErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // NextAuth redirects a refused OAuth sign-in back here with ?error=. The
  // signIn guard returns "AccessDenied" for an unverified Google address; show a
  // clear message instead of the raw code.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setOauthErrorCode(code);
  }, []);

  const displayError =
    error ||
    (oauthErrorCode === 'AccessDenied'
      ? t('auth.googleUnverified')
      : oauthErrorCode
        ? t('auth.genericError')
        : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.ok) {
      router.replace(destination);
    } else {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight">CorpControl</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t('auth.signInTitle')}</CardTitle>
            <CardDescription>{t('auth.signInSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleSignInButton />
            <form onSubmit={handleSubmit} className="space-y-4">
              {displayError && <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm">{displayError}</div>}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e: any) => setEmail(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e: any) => setPassword(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.noAccount')}{' '}
              {/* Carries the destination across: someone who came here for a
                  plan and turns out to need an account must not lose it. */}
              <Link href={withCallbackUrl('/auth/signup', callbackUrl)} className="text-primary font-medium hover:underline">Create one</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

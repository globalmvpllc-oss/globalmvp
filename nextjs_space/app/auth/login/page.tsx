'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Mail, Lock } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { GoogleSignInButton } from '@/components/google-signin-button';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
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
      router.replace('/dashboard');
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
          <span className="text-2xl font-display font-bold tracking-tight">FinanceFlow</span>
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
              <Link href="/auth/signup" className="text-primary font-medium hover:underline">Create one</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

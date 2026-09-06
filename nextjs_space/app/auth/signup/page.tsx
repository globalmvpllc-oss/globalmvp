'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Mail, Lock, User } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import { GoogleSignInButton } from '@/components/google-signin-button';
import { withCallbackUrl } from '@/lib/safe-redirect';

/**
 * `useSearchParams` makes this page dynamic. Without saying so, `next build`
 * refuses to prerender it and fails the whole build rather than shipping a page
 * whose HTML would be wrong for half its visitors.
 */
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Where the new account should end up, when the visitor asked for somewhere
   * in particular — a plan they pressed Upgrade on, on the public pricing.
   *
   * Signup does not go there itself: a new account has no company yet, so it
   * still goes to onboarding, and the destination is handed on rather than
   * resolved here. Onboarding validates and follows it once the company exists.
   */
  const callbackUrl = searchParams.get('callbackUrl');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Signup failed'); setLoading(false); return; }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.ok) {
        router.replace(withCallbackUrl('/onboarding', callbackUrl));
      } else {
        setError('Account created but login failed. Please sign in.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong');
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
            <CardTitle className="text-xl">{t('auth.signUpTitle')}</CardTitle>
            <CardDescription>Start managing your finances in minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleSignInButton />
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="name" placeholder="Your name" value={name} onChange={(e: any) => setName(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e: any) => setEmail(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e: any) => setPassword(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('auth.creatingAccount') : t('auth.signUp')}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.haveAccount')}{' '}
              {/* Carries the destination across: an existing customer who
                  followed a plan link must not lose it by signing in instead. */}
              <Link href={withCallbackUrl('/auth/login', callbackUrl)} className="text-primary font-medium hover:underline">{t('auth.signIn')}</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

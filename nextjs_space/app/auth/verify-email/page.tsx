'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';

/**
 * Spends the verification token. If the GET link already resolved it, the URL
 * carries ?status=verified|invalid; otherwise the page POSTs the ?token itself.
 */
export default function VerifyEmailPage() {
  const { t } = useI18n();
  const [state, setState] = useState<'checking' | 'verified' | 'invalid'>('checking');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'verified' || status === 'invalid') {
      setState(status);
      return;
    }
    const token = params.get('token');
    if (!token) {
      setState('invalid');
      return;
    }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => setState(res.ok ? 'verified' : 'invalid'))
      .catch(() => setState('invalid'));
  }, []);

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
            <CardTitle className="text-xl">{t('verify.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {state === 'checking' ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('verify.checking')}
              </p>
            ) : state === 'verified' ? (
              <>
                <p className="flex items-center justify-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="w-5 h-5" /> {t('verify.success')}
                </p>
                <Button asChild className="w-full">
                  <Link href="/dashboard">{t('verify.goToApp')}</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="flex items-center justify-center gap-2 text-sm text-red-600">
                  <XCircle className="w-5 h-5" /> {t('verify.invalid')}
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/login">{t('auth.backToLogin')}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

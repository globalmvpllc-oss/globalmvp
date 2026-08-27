'use client';

import { useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/i18n-provider';

/**
 * "Continue with Google", plus a divider before the email/password form.
 *
 * Renders nothing unless the Google provider is actually configured: it reads
 * NextAuth's own provider list (/api/auth/providers), which only includes Google
 * when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. So on a deployment
 * without them, the page looks exactly as it does today — no button that would
 * fail on click.
 */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.93H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.32a7.19 7.19 0 0 1 0-4.64V6.59H1.29a12 12 0 0 0 0 10.82l4.02-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.59l4.02 3.09C6.25 6.85 8.89 4.75 12 4.75z"
      />
    </svg>
  );
}

export function GoogleSignInButton() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getProviders()
      .then((providers) => {
        if (active) setAvailable(Boolean(providers?.google));
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          signIn('google', { callbackUrl: '/dashboard' });
        }}
      >
        <GoogleG className="mr-2" />
        {loading ? t('common.loading') : t('auth.continueWithGoogle')}
      </Button>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{t('auth.orContinueWith')}</span>
        </div>
      </div>
    </div>
  );
}

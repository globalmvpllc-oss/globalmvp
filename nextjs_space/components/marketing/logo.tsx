'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/i18n-provider';

/**
 * Client component only for the translated accessible name. The product name
 * itself is a proper noun and is never translated.
 */
export function Logo({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <Link
      href="/"
      className={cn(
        'inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      aria-label={t('landing.logoHome')}
    >
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-primary">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 18V13" /><path d="M10 18V8" /><path d="M16 18V11" /><path d="M20 18V5" />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-tight">CorpControl</span>
    </Link>
  );
}

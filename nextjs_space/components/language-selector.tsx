'use client';

import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Language selector.
 *
 * Each option is written in its own language — a reader looking for Turkish
 * scans for "Türkçe", not for "Turkish" spelled in a language they are trying
 * to leave.
 *
 * Uses the same Select primitive as the rest of the application rather than a
 * bespoke control, so it inherits the existing keyboard and focus behaviour.
 *
 * Two presentations, one control. `field` is the labelled block used in the
 * application sidebar; `compact` is the trigger-only form the public site
 * header needs, where there is no room for a label above it. Both go through
 * the same `setLocale`, so the cookie write and `router.refresh()` behave
 * identically and a choice made on the marketing site survives into the
 * application after sign-in.
 */
export function LanguageSelector({
  variant = 'field',
  className,
}: {
  variant?: 'field' | 'compact';
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  const select = (
    <Select value={locale} onValueChange={(next: string) => setLocale(next as Locale)}>
      <SelectTrigger
        className={cn(
          variant === 'compact'
            ? 'h-8 w-auto gap-1.5 border-none bg-transparent px-2 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground'
            : 'h-8 text-sm',
          className
        )}
        aria-label={t('common.language')}
      >
        {variant === 'compact' ? (
          <Languages aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {LOCALE_LABELS[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (variant === 'compact') return select;

  return (
    <div className="px-3 py-2">
      <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Languages className="h-3.5 w-3.5" />
        {t('common.language')}
      </label>
      {select}
    </div>
  );
}

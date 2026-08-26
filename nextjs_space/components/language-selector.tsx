'use client';

import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';

/**
 * Language selector.
 *
 * Each option is written in its own language — a reader looking for Turkish
 * scans for "Türkçe", not for "Turkish" spelled in a language they are trying
 * to leave.
 *
 * Uses the same Select primitive as the rest of the application rather than a
 * bespoke control, so it inherits the existing keyboard and focus behaviour.
 */
export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="px-3 py-2">
      <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Languages className="h-3.5 w-3.5" />
        {t('common.language')}
      </label>
      <Select value={locale} onValueChange={(next: string) => setLocale(next as Locale)}>
        <SelectTrigger className="h-8 text-sm" aria-label={t('common.language')}>
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
    </div>
  );
}

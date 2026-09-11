'use client';

import { useI18n } from '@/components/i18n-provider';
import { OPEN_CONSENT_EVENT } from '@/components/cookie-consent';

/**
 * Reopens the cookie preference panel.
 *
 * Consent has to be as easy to withdraw as it was to give, which means a
 * permanent way back to the panel rather than only the banner that appears
 * once. This is that way back: it sits in the site footer, and again on the
 * cookie policy page next to the description of what the toggles do.
 *
 * Styled to match whichever of the two it is in, via `className`, so neither
 * placement needs a variant of the component.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={className}
    >
      {t('consent.settings')}
    </button>
  );
}

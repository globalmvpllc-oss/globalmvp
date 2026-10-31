'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import type { ConsentChoices } from '@/lib/consent';
import { ensureGoogle, ensureMeta, trackingConfig } from '@/lib/tracking/events';

/**
 * Loads the measurement scripts the visitor has allowed — and nothing else.
 *
 * Rendered by `CookieConsent`, which owns the decision. With no decision, or
 * after "Reject", this renders nothing and no request is made to Google or
 * Meta at all. Each script also needs its own id to be configured; a missing
 * variable means that tool is simply not loaded.
 *
 *   - gtag.js serves both GA4 (needs "analytics") and Google Ads (needs
 *     "advertising"). One copy is loaded, under whichever id is allowed.
 *   - Meta's fbevents.js needs "advertising".
 *
 * Withdrawing consent: Google is told through Consent Mode by the banner
 * itself; Meta is told here with `fbq('consent', 'revoke')`, and `track()`
 * stops sending either way because it re-reads the cookie on every event.
 */
export function TrackingTags({ choices }: { choices: ConsentChoices | null }) {
  const config = trackingConfig;

  let googleId: string | null = null;
  if (choices?.ads && config.googleAdsId) googleId = config.googleAdsId;
  else if (choices?.analytics && config.ga4Id) googleId = config.ga4Id;

  const metaAllowed = Boolean(choices?.ads && config.metaPixelId);

  useEffect(() => {
    if (!choices) return;
    ensureGoogle(config, choices);
    ensureMeta(config, choices);
    if (!choices.ads && typeof window.fbq === 'function') window.fbq('consent', 'revoke');
  }, [choices, config]);

  return (
    <>
      {googleId ? (
        <Script
          id="google-tag"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`}
        />
      ) : null}
      {metaAllowed ? (
        <Script id="meta-pixel" strategy="afterInteractive" src="https://connect.facebook.net/en_US/fbevents.js" />
      ) : null}
    </>
  );
}

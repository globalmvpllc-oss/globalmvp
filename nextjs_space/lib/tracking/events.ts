/**
 * Conversion measurement: Google Analytics 4, Google Ads and the Meta Pixel.
 *
 * Every event the application reports goes through `track()` in this file.
 * Nothing else calls `gtag` or `fbq` for a conversion, so the three rules that
 * matter are enforced in exactly one place:
 *
 *   1. Consent. Nothing is sent unless the visitor allowed it in the cookie
 *      banner: GA4 needs "analytics", Google Ads and Meta need "advertising".
 *      No decision and "Reject" are treated the same — nothing goes out.
 *   2. Configuration. Each tool is switched on by its own NEXT_PUBLIC_ variable.
 *      A missing or malformed id means that tool is skipped silently; the
 *      others still work.
 *   3. No personal data. Events carry ids, plan names, amounts and currencies
 *      only. There is no field here a name, email or phone number could ride
 *      in, and Meta's automatic form scraping is switched off (`autoConfig`).
 *
 * The split: `buildTrackingCalls` is pure (no window, no cookies) and decides
 * what would be sent; `track` reads the browser state and sends it. Tests
 * assert the first directly.
 */

import { CONSENT_COOKIE, parseConsent, type ConsentChoices } from '@/lib/consent';

// --- Configuration ----------------------------------------------------------

export interface TrackingConfig {
  ga4Id: string | null;
  googleAdsId: string | null;
  adsSignupLabel: string | null;
  adsPurchaseLabel: string | null;
  metaPixelId: string | null;
}

/** Keeps a value only if it looks like the kind of id it claims to be. */
function idOrNull(value: string | undefined, pattern: RegExp): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed !== '' && pattern.test(trimmed) ? trimmed : null;
}

/**
 * Reads the five ⚙️ config variables. All are public by nature — they are
 * sent to the browser in the tag itself — so none is a secret.
 *
 * Each `process.env.NEXT_PUBLIC_…` is written out literally: Next.js inlines
 * these at build time only when it can see the full name. Changing a value
 * therefore needs a redeploy.
 */
export function readTrackingConfig(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_GA4_ID: process.env.NEXT_PUBLIC_GA4_ID,
    NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    NEXT_PUBLIC_GADS_LABEL_SIGNUP: process.env.NEXT_PUBLIC_GADS_LABEL_SIGNUP,
    NEXT_PUBLIC_GADS_LABEL_PURCHASE: process.env.NEXT_PUBLIC_GADS_LABEL_PURCHASE,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  }
): TrackingConfig {
  return {
    ga4Id: idOrNull(env.NEXT_PUBLIC_GA4_ID, /^G-[A-Z0-9]{4,20}$/),
    googleAdsId: idOrNull(env.NEXT_PUBLIC_GOOGLE_ADS_ID, /^AW-\d{6,15}$/),
    adsSignupLabel: idOrNull(env.NEXT_PUBLIC_GADS_LABEL_SIGNUP, /^[A-Za-z0-9_-]{4,40}$/),
    adsPurchaseLabel: idOrNull(env.NEXT_PUBLIC_GADS_LABEL_PURCHASE, /^[A-Za-z0-9_-]{4,40}$/),
    metaPixelId: idOrNull(env.NEXT_PUBLIC_META_PIXEL_ID, /^\d{6,20}$/),
  };
}

export const trackingConfig: TrackingConfig = readTrackingConfig();

// --- Events -----------------------------------------------------------------

type PlanName = 'pro' | 'business';
type Interval = 'month' | 'year';

export type TrackingEvent =
  /** Account and company set up (end of onboarding). Fired once per account. */
  | { name: 'sign_up' }
  /** The customer is being sent to Polar's checkout. */
  | {
      name: 'begin_checkout';
      plan: PlanName;
      interval: Interval;
      value?: number | null;
      currency?: string | null;
    }
  /** A checkout Polar has confirmed as paid. */
  | {
      name: 'purchase';
      transactionId: string;
      plan: PlanName | null;
      interval: Interval | null;
      value: number;
      currency: string;
    }
  /** An existing subscription moved up a plan; value is the prorated difference. */
  | {
      name: 'plan_upgrade';
      transactionId: string;
      plan: PlanName;
      value: number;
      currency: string;
    };

export type TrackingCall =
  | { vendor: 'gtag'; args: unknown[] }
  | { vendor: 'fbq'; args: unknown[] };

function itemFor(plan: PlanName | null, interval: Interval | null) {
  const id = plan ? `${plan}_${interval ?? 'month'}` : 'subscription';
  const name = plan ? `CorpControl ${plan === 'pro' ? 'Pro' : 'Business'}` : 'CorpControl';
  return { item_id: id, item_name: name, quantity: 1 };
}

/** Money must be a finite, non-negative number with a 3-letter currency. */
function money(value: unknown, currency: unknown): { value: number; currency: string } | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) return null;
  return { value: Math.round(value * 100) / 100, currency: currency.toUpperCase() };
}

/**
 * What would be sent for an event, given the configuration and the consent.
 * Pure: an empty list means nothing goes out.
 */
export function buildTrackingCalls(
  event: TrackingEvent,
  config: TrackingConfig,
  consent: ConsentChoices | null
): TrackingCall[] {
  if (!consent) return [];
  const ga4 = consent.analytics ? config.ga4Id : null;
  const ads = consent.ads ? config.googleAdsId : null;
  const meta = consent.ads ? config.metaPixelId : null;
  const calls: TrackingCall[] = [];

  switch (event.name) {
    case 'sign_up': {
      if (ga4) calls.push({ vendor: 'gtag', args: ['event', 'sign_up', { send_to: ga4 }] });
      if (ads && config.adsSignupLabel) {
        calls.push({ vendor: 'gtag', args: ['event', 'conversion', { send_to: `${ads}/${config.adsSignupLabel}` }] });
      }
      if (meta) calls.push({ vendor: 'fbq', args: ['track', 'CompleteRegistration'] });
      break;
    }

    case 'begin_checkout': {
      const item = itemFor(event.plan, event.interval);
      const amount = money(event.value, event.currency);
      if (ga4) {
        calls.push({
          vendor: 'gtag',
          args: ['event', 'begin_checkout', { send_to: ga4, ...(amount ?? {}), items: [item] }],
        });
      }
      if (meta) {
        calls.push({
          vendor: 'fbq',
          args: ['track', 'InitiateCheckout', { ...(amount ?? {}), content_ids: [item.item_id], content_type: 'product' }],
        });
      }
      break;
    }

    case 'purchase': {
      const amount = money(event.value, event.currency);
      if (!amount || !event.transactionId) break;
      const item = itemFor(event.plan, event.interval);
      if (ga4) {
        calls.push({
          vendor: 'gtag',
          args: ['event', 'purchase', { send_to: ga4, transaction_id: event.transactionId, ...amount, items: [item] }],
        });
      }
      if (ads && config.adsPurchaseLabel) {
        calls.push({
          vendor: 'gtag',
          args: [
            'event',
            'conversion',
            { send_to: `${ads}/${config.adsPurchaseLabel}`, transaction_id: event.transactionId, ...amount },
          ],
        });
      }
      if (meta) {
        calls.push({
          vendor: 'fbq',
          args: [
            'track',
            'Purchase',
            { ...amount, content_ids: [item.item_id], content_type: 'product' },
            // Meta de-duplicates on eventID, so a repeat of the same payment is one sale.
            { eventID: event.transactionId },
          ],
        });
      }
      break;
    }

    case 'plan_upgrade': {
      const amount = money(event.value, event.currency);
      if (!amount || !event.transactionId || !ga4) break;
      calls.push({
        vendor: 'gtag',
        args: [
          'event',
          'purchase',
          { send_to: ga4, transaction_id: event.transactionId, ...amount, items: [itemFor(event.plan, 'month')] },
        ],
      });
      break;
    }
  }

  return calls;
}

/** Events that represent money and must be counted once per transaction. */
export function dedupeKeyFor(event: TrackingEvent): string | null {
  if (event.name === 'purchase' || event.name === 'plan_upgrade') {
    return event.transactionId ? `cc_tracked_${event.transactionId}` : null;
  }
  return null;
}

// --- Browser side -----------------------------------------------------------

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __ccTracking?: { google?: string[]; meta?: boolean };
  }
}

/** The visitor's stored decision, or null when there is none. */
export function readConsentChoices(): ConsentChoices | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(['(?:^|;\\s*)', CONSENT_COOKIE, '=([^;]*)'].join('')));
  return parseConsent(match?.[1])?.choices ?? null;
}

function state() {
  window.__ccTracking = window.__ccTracking ?? {};
  return window.__ccTracking;
}

/**
 * Configures the Google targets this visitor allowed, once each.
 *
 * Commands queue in `dataLayer` until gtag.js (loaded by `TrackingTags`)
 * arrives, so this is safe to call before the script is on the page. The
 * bootstrap script in the root layout has already set Consent Mode defaults.
 */
export function ensureGoogle(config: TrackingConfig, consent: ConsentChoices | null): void {
  if (typeof window === 'undefined' || !consent || typeof window.gtag !== 'function') return;
  const done = new Set(state().google ?? []);
  const targets = [consent.analytics ? config.ga4Id : null, consent.ads ? config.googleAdsId : null].filter(
    (id): id is string => Boolean(id) && !done.has(id as string)
  );
  if (targets.length === 0) return;
  if (done.size === 0) window.gtag('js', new Date());
  for (const id of targets) {
    window.gtag('config', id);
    done.add(id);
  }
  state().google = Array.from(done);
}

/**
 * Installs Meta's command queue and initialises the pixel, once.
 *
 * The queue is Meta's standard stub; fbevents.js (loaded by `TrackingTags`)
 * replays it. `autoConfig` off stops the pixel from scraping form fields and
 * buttons on its own, which is how personal data could otherwise leak in.
 */
export function ensureMeta(config: TrackingConfig, consent: ConsentChoices | null): void {
  if (typeof window === 'undefined' || !consent?.ads || !config.metaPixelId) return;
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }
  if (state().meta) return;
  window.fbq('set', 'autoConfig', false, config.metaPixelId);
  window.fbq('consent', 'grant');
  window.fbq('init', config.metaPixelId);
  window.fbq('track', 'PageView');
  state().meta = true;
}

/**
 * Sends an event to every tool the visitor allowed and the deployment
 * configured. Money events are sent once per transaction id per browser, on
 * top of the de-duplication the tools themselves do on that id.
 */
export function track(event: TrackingEvent, config: TrackingConfig = trackingConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const consent = readConsentChoices();
    const calls = buildTrackingCalls(event, config, consent);
    if (calls.length === 0) return;

    const key = dedupeKeyFor(event);
    if (key) {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, String(Date.now()));
    }

    ensureGoogle(config, consent);
    ensureMeta(config, consent);
    for (const call of calls) {
      if (call.vendor === 'gtag' && typeof window.gtag === 'function') window.gtag(...call.args);
      if (call.vendor === 'fbq' && typeof window.fbq === 'function') window.fbq(...call.args);
    }
  } catch {
    // Measurement must never break the page it is measuring.
  }
}

/**
 * Gives the tags a moment to send before the page is left (used right before
 * redirecting to Polar). Capped, so a blocked tag never holds the customer up.
 */
export function flushTracking(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

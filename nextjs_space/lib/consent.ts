/**
 * Cookie consent model.
 *
 * Pure data and pure functions only — no React, no `document` — so the rules
 * that decide what Google is allowed to do can be asserted directly in a unit
 * test rather than driven through a rendered banner.
 *
 * The shape of the decision:
 *
 *   - Strictly necessary cookies are not a category here. They are set because
 *     the service cannot run without them, they are never offered as a toggle,
 *     and no consent is recorded for them.
 *   - Everything else is opt-in and starts denied. A visitor who has made no
 *     choice, and a visitor who pressed "reject", are treated identically by
 *     every function below.
 *
 * `lib/i18n` is the model for the file: the constants that other modules need
 * to agree on live in one place, and the browser-facing helpers are built on
 * top of them rather than repeating the literals.
 */

/**
 * Cookie the decision is stored in.
 *
 * A cookie rather than `localStorage` for two reasons that both matter: the
 * value has to be readable by the inline bootstrap script before React has
 * loaded (see `consentBootstrapScript`), and a cookie is subject to the same
 * clearing gesture as the cookies it governs — someone who clears site data to
 * revoke consent should not find their consent record survived.
 */
export const CONSENT_COOKIE = 'cc_cookie_consent';

/**
 * Version of the disclosure the stored decision was given against.
 *
 * A stored record carrying a different version is treated as no record at all,
 * so the banner returns and the choice is taken again. Bump this only when
 * what is being consented to actually changes — a new vendor, a new category,
 * a new purpose — never for wording.
 */
export const CONSENT_VERSION = 1;

/**
 * How long a recorded decision is honoured before being asked again.
 *
 * Six months. Neither the GDPR nor the KVKK names a figure; six months is the
 * period supervisory authorities most commonly point to for consent records,
 * and re-asking annually or less often is the part that draws objection.
 */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** The optional categories a visitor can turn on. Necessary is not one. */
export const OPTIONAL_CATEGORIES = ['ads', 'analytics'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

/** What the visitor allowed. Absent categories are denied, never assumed. */
export type ConsentChoices = Record<OptionalCategory, boolean>;

/** A stored decision: what was allowed, when, and against which disclosure. */
export interface ConsentRecord {
  version: number;
  /** Epoch milliseconds the choice was recorded. Kept so a decision is dateable. */
  at: number;
  choices: ConsentChoices;
}

/** Nothing optional allowed. The state before any choice, and after "reject". */
export const DENY_ALL: ConsentChoices = { ads: false, analytics: false };

/** Everything optional allowed. Only ever reached by an explicit "accept all". */
export const GRANT_ALL: ConsentChoices = { ads: true, analytics: true };

export type ConsentState = 'granted' | 'denied';

/** The four signals Google Consent Mode v2 reads. */
export interface GoogleConsentSignals {
  ad_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
  analytics_storage: ConsentState;
}

/**
 * The defaults sent before any tag is allowed to run.
 *
 * All four denied. This is the whole point of the exercise: the Google tag
 * must never be in a position to write a cookie or send an identifier on the
 * strength of a visitor having said nothing yet.
 */
export const DEFAULT_GOOGLE_CONSENT: GoogleConsentSignals = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
};

/**
 * The Google Ads account the conversion tag reports to.
 *
 * Overridable by environment so a staging deployment can point elsewhere or,
 * by setting it empty, run with no tag at all. The literal is the fallback
 * rather than a hardcode, because a build with no environment configured
 * should still behave like production.
 */
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? 'AW-18398758629';

/** Serialises a decision for storage in a cookie value. */
export function serializeConsent(record: ConsentRecord): string {
  return encodeURIComponent(JSON.stringify(record));
}

/**
 * Reads a stored decision back, or `null` if there is not a usable one.
 *
 * Deliberately strict. Malformed JSON, a record from an older disclosure
 * version, a `choices` object that is not an object, or a category holding
 * anything other than `true` all resolve to "no consent" rather than to a
 * partial grant. The failure direction is the one that under-collects.
 */
export function parseConsent(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== CONSENT_VERSION) return null;

  const choices = record.choices;
  if (typeof choices !== 'object' || choices === null) return null;
  const given = choices as Record<string, unknown>;

  return {
    version: CONSENT_VERSION,
    at: typeof record.at === 'number' ? record.at : 0,
    choices: {
      ads: given.ads === true,
      analytics: given.analytics === true,
    },
  };
}

/**
 * Maps a decision onto the Consent Mode v2 signals.
 *
 * The advertising toggle drives three signals rather than one. `ad_storage` is
 * the cookie itself, `ad_user_data` is whether data may be sent to Google for
 * advertising purposes at all, and `ad_personalization` is whether it may feed
 * remarketing. Granting the first while leaving the others denied is a
 * configuration that looks compliant and measures nothing, so the toggle the
 * visitor sees governs all three together.
 */
export function googleConsentFor(choices: ConsentChoices): GoogleConsentSignals {
  const ads: ConsentState = choices.ads ? 'granted' : 'denied';
  return {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: choices.analytics ? 'granted' : 'denied',
  };
}

/**
 * Whether `gtag.js` may be fetched at all.
 *
 * Consent Mode supports a looser arrangement — load the tag for everyone and
 * let the denied signals suppress its storage — and Google recommends it,
 * because it lets them model the conversions consent removed. It is not what
 * this application does. Requesting the script still discloses the visitor's
 * IP address and the page they are on to Google, and doing that before a
 * lawful basis exists is the thing the banner is there to prevent.
 *
 * So: no decision, or a decision that granted nothing, means no request is
 * ever made. The defaults in `DEFAULT_GOOGLE_CONSENT` are still published
 * first, so that if the tag is later loaded it begins denied regardless.
 */
export function shouldLoadGoogleTag(choices: ConsentChoices | null): boolean {
  if (!choices) return false;
  return choices.ads || choices.analytics;
}

/**
 * The inline script that establishes Consent Mode before anything else runs.
 *
 * Built from the constants above rather than written out as a literal, so the
 * cookie name and version cannot drift away from `parseConsent`.
 *
 * Why it re-reads the cookie itself instead of leaving that to React: the
 * ordering rule for Consent Mode is that `default` must reach the data layer
 * before the tag does, and a returning visitor's `update` should follow
 * immediately. Doing both here — in markup that ships with the document —
 * makes that ordering a property of the page rather than of when a component
 * happened to mount.
 *
 * `ads_data_redaction` removes ad click identifiers from the pings that are
 * still sent while `ad_storage` is denied. `url_passthrough` lets the click id
 * survive in the URL across navigations so a later granted conversion can
 * still be attributed, without it being stored anywhere.
 */
export function consentBootstrapScript(): string {
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', ${JSON.stringify({ ...DEFAULT_GOOGLE_CONSENT, wait_for_update: 500 })});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);
try {
  var stored = document.cookie.match(/(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)/);
  if (stored) {
    var record = JSON.parse(decodeURIComponent(stored[1]));
    if (record && record.version === ${CONSENT_VERSION} && record.choices) {
      var ads = record.choices.ads === true ? 'granted' : 'denied';
      gtag('consent', 'update', {
        ad_storage: ads,
        ad_user_data: ads,
        ad_personalization: ads,
        analytics_storage: record.choices.analytics === true ? 'granted' : 'denied'
      });
      if (ads === 'granted') gtag('set', 'ads_data_redaction', false);
    }
  }
} catch (e) {}
`.trim();
}

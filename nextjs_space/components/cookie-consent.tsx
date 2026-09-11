'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/components/i18n-provider';
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_VERSION,
  DENY_ALL,
  GOOGLE_ADS_ID,
  GRANT_ALL,
  googleConsentFor,
  parseConsent,
  serializeConsent,
  shouldLoadGoogleTag,
  type ConsentChoices,
} from '@/lib/consent';

/**
 * Event the footer link and the cookie policy page dispatch to reopen the
 * panel. A window event rather than a context because the callers are server
 * components several trees away, and a consent banner is not state anything
 * else in the application needs to read.
 */
export const OPEN_CONSENT_EVENT = 'cookie-consent:open';

/** Reads the stored decision. Returns null when there is not a usable one. */
function readStoredChoices(): ConsentChoices | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match?.[1])?.choices ?? null;
}

/**
 * Sends a Consent Mode command, installing the shim first if it is missing.
 *
 * The bootstrap script in the root layout defines `window.gtag` while the
 * parser is still in the document head, so in practice it is always there.
 * Recreating it rather than calling optionally covers the case that actually
 * matters: if that script ever failed, an optional call would silently
 * discard a withdrawal of consent, which is the one command that must never
 * be lost.
 */
function sendToGoogle(...command: unknown[]): void {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    // `arguments` rather than the rest array on purpose: the tag replays
    // arguments objects out of the data layer, and that is what Google's own
    // shim pushes.
    window.gtag = function gtagShim() {
      window.dataLayer?.push(arguments);
    };
  }
  window.gtag(...command);
}

/**
 * Records a decision and tells Google about it.
 *
 * `SameSite=Lax`, and `Secure` only over HTTPS, matching how the locale cookie
 * is written: the value is a preference rather than a credential, and marking
 * it `Secure` unconditionally would stop it working over plain HTTP on
 * localhost.
 */
function persistChoices(choices: ConsentChoices): void {
  const value = serializeConsent({ version: CONSENT_VERSION, at: Date.now(), choices });
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;

  sendToGoogle('consent', 'update', googleConsentFor(choices));
  // Only ever relaxed, never re-tightened here: the bootstrap sets redaction on
  // for every page load, so a later withdrawal restores it on the next request
  // and `ad_storage: denied` suppresses the storage in the meantime.
  if (choices.ads) sendToGoogle('set', 'ads_data_redaction', false);
}

/**
 * Cookie consent banner, preference panel, and the Google tag they gate.
 *
 * Three things live in one component on purpose: whether the tag is allowed to
 * load is the same piece of state as what the panel shows, and splitting them
 * across a context would put a second copy of the rule somewhere it could
 * disagree with the first.
 *
 * The decision is read in an effect rather than during render. Reading
 * `document.cookie` while rendering would make the server and client disagree
 * about whether the banner exists, and a hydration mismatch on a legally
 * required control is not a trade worth making for one frame.
 */
export function CookieConsent() {
  const { t } = useI18n();
  const headingId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  /** `undefined` while the cookie has not been read yet; `null` once read and absent. */
  const [choices, setChoices] = useState<ConsentChoices | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  /** What the switches currently show, which is not yet what has been saved. */
  const [draft, setDraft] = useState<ConsentChoices>(DENY_ALL);
  /** Set when the panel was opened deliberately, so focus can be moved to it. */
  const [focusOnOpen, setFocusOnOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredChoices();
    setChoices(stored);
    if (stored) setDraft(stored);
    // No stored decision means the banner, not the preference panel: the first
    // ask should be answerable with one button.
    setOpen(stored === null);
  }, []);

  useEffect(() => {
    const reopen = () => {
      setDraft(readStoredChoices() ?? DENY_ALL);
      setShowPreferences(true);
      setOpen(true);
      setFocusOnOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (open && focusOnOpen) {
      panelRef.current?.focus();
      setFocusOnOpen(false);
    }
  }, [open, focusOnOpen]);

  const decide = useCallback(
    (next: ConsentChoices, announce: boolean) => {
      persistChoices(next);
      setChoices(next);
      setDraft(next);
      setOpen(false);
      setShowPreferences(false);
      if (announce) toast.success(t('consent.saved'));
    },
    [t]
  );

  const tagAllowed = GOOGLE_ADS_ID !== '' && shouldLoadGoogleTag(choices ?? null);

  return (
    <>
      {/*
        Only reached once a visitor has allowed advertising or measurement.
        Until then no request is made to Google at all — see
        `shouldLoadGoogleTag` for why loading it in a denied state is not
        treated as good enough here.
      */}
      {tagAllowed ? (
        <>
          <Script
            id="google-tag"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
          />
          <Script id="google-tag-config" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}` +
              `gtag('js', new Date());gtag('config', ${JSON.stringify(GOOGLE_ADS_ID)});`}
          </Script>
        </>
      ) : null}

      {open ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
            className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-border bg-background p-5 shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={headingId} className="font-display text-base font-semibold text-foreground">
                {t('consent.title')}
              </h2>
              {/*
                Offered only to someone who has already answered. On the first
                ask there is deliberately no dismiss: a banner that can be
                closed without answering leaves no decision recorded, so it
                returns on the next page and starts to read as something to
                get rid of rather than something to answer. Once a decision
                exists, reopening the panel to look at it must be reversible —
                otherwise the only way out is to overwrite the answer.
              */}
              {choices ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setShowPreferences(false);
                  }}
                  aria-label={t('consent.close')}
                  className="-m-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t('consent.body')}{' '}
              <Link
                href="/cookies"
                className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('consent.policyLink')}
              </Link>
            </p>

            {showPreferences ? (
              <div className="mt-5 space-y-4 border-t border-border pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('consent.necessary')}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {t('consent.necessaryDesc')}
                    </p>
                  </div>
                  {/*
                    Shown as text, not as a disabled switch. A switch that
                    cannot move invites the visitor to try to move it and
                    reads, wrongly, as a choice they are being denied.
                  */}
                  <span className="mt-0.5 shrink-0 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t('consent.alwaysOn')}
                  </span>
                </div>

                <ConsentToggle
                  label={t('consent.ads')}
                  description={t('consent.adsDesc')}
                  checked={draft.ads}
                  onChange={(value) => setDraft((current) => ({ ...current, ads: value }))}
                />

                <ConsentToggle
                  label={t('consent.analytics')}
                  description={t('consent.analyticsDesc')}
                  checked={draft.analytics}
                  onChange={(value) => setDraft((current) => ({ ...current, analytics: value }))}
                />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {showPreferences ? (
                <Button variant="outline" size="sm" onClick={() => decide(draft, true)}>
                  {t('consent.save')}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setShowPreferences(true)}>
                  {t('consent.preferences')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => decide(DENY_ALL, showPreferences)}>
                {t('consent.reject')}
              </Button>
              <Button size="sm" onClick={() => decide(GRANT_ALL, showPreferences)}>
                {t('consent.accept')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

import { describe, it, expect } from 'vitest';
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  DEFAULT_GOOGLE_CONSENT,
  DENY_ALL,
  GRANT_ALL,
  consentBootstrapScript,
  googleConsentFor,
  parseConsent,
  serializeConsent,
  shouldLoadGoogleTag,
} from '@/lib/consent';

/**
 * The rules that decide what Google is permitted to do.
 *
 * Worth asserting directly rather than through the banner: every one of these
 * has a wrong answer that looks fine on screen — a tag that loads for someone
 * who declined, a stale consent record honoured after the disclosure changed,
 * a malformed cookie read as a grant — and none of them would show up as a
 * visual defect.
 */
describe('consent defaults', () => {
  it('denies all four Consent Mode v2 signals before any choice', () => {
    expect(DEFAULT_GOOGLE_CONSENT).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
  });

  it('treats an absent decision the same as a refusal', () => {
    expect(shouldLoadGoogleTag(null)).toBe(false);
    expect(shouldLoadGoogleTag(DENY_ALL)).toBe(false);
  });

  it('loads the tag once either optional category is allowed', () => {
    expect(shouldLoadGoogleTag(GRANT_ALL)).toBe(true);
    expect(shouldLoadGoogleTag({ ads: true, analytics: false })).toBe(true);
    expect(shouldLoadGoogleTag({ ads: false, analytics: true })).toBe(true);
  });
});

describe('mapping a decision onto Consent Mode signals', () => {
  it('grants nothing for a refusal', () => {
    expect(googleConsentFor(DENY_ALL)).toEqual(DEFAULT_GOOGLE_CONSENT);
  });

  it('grants all four for a full acceptance', () => {
    expect(googleConsentFor(GRANT_ALL)).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
  });

  it('drives all three advertising signals from the single advertising toggle', () => {
    // ad_storage granted while ad_user_data stays denied is the classic
    // misconfiguration: it passes a cookie audit and measures nothing.
    expect(googleConsentFor({ ads: true, analytics: false })).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'denied',
    });
  });

  it('keeps measurement independent of advertising', () => {
    expect(googleConsentFor({ ads: false, analytics: true })).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
  });
});

describe('reading a stored decision', () => {
  it('round-trips a decision through the cookie value', () => {
    const record = { version: CONSENT_VERSION, at: 1_757_548_800_000, choices: GRANT_ALL };
    expect(parseConsent(serializeConsent(record))).toEqual(record);
  });

  it('produces a cookie value with nothing that would break a cookie header', () => {
    const value = serializeConsent({ version: CONSENT_VERSION, at: 0, choices: GRANT_ALL });
    expect(value).not.toMatch(/[;,\s"]/);
  });

  it.each([
    ['nothing at all', undefined],
    ['an empty value', ''],
    ['text that is not JSON', 'yes-please'],
    ['JSON that is not an object', '123'],
    ['an object with no choices', encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION }))],
  ])('reads %s as no consent', (_label, raw) => {
    expect(parseConsent(raw as string | undefined)).toBeNull();
  });

  it('ignores a decision recorded against an older disclosure', () => {
    const stale = encodeURIComponent(
      JSON.stringify({ version: CONSENT_VERSION - 1, at: 0, choices: GRANT_ALL })
    );
    expect(parseConsent(stale)).toBeNull();
  });

  it('grants only on a literal true, never on a truthy value', () => {
    const sloppy = encodeURIComponent(
      JSON.stringify({ version: CONSENT_VERSION, at: 0, choices: { ads: 'yes', analytics: 1 } })
    );
    expect(parseConsent(sloppy)?.choices).toEqual(DENY_ALL);
  });

  it('fills in a category the stored record is missing as denied', () => {
    const partial = encodeURIComponent(
      JSON.stringify({ version: CONSENT_VERSION, at: 0, choices: { ads: true } })
    );
    expect(parseConsent(partial)?.choices).toEqual({ ads: true, analytics: false });
  });
});

describe('the inline bootstrap script', () => {
  const script = consentBootstrapScript();

  it('publishes the denied defaults before anything else', () => {
    expect(script).toContain("gtag('consent', 'default'");
    expect(script.indexOf("'default'")).toBeLessThan(script.indexOf("'update'"));
    for (const signal of Object.keys(DEFAULT_GOOGLE_CONSENT)) {
      expect(script).toContain(`"${signal}":"denied"`);
    }
  });

  it('reads the same cookie and version the parser writes', () => {
    expect(script).toContain(CONSENT_COOKIE);
    expect(script).toContain(`record.version === ${CONSENT_VERSION}`);
  });

  it('redacts ad click identifiers unless advertising was granted', () => {
    expect(script).toContain("gtag('set', 'ads_data_redaction', true)");
    expect(script).toContain("if (ads === 'granted') gtag('set', 'ads_data_redaction', false)");
  });

  it('never loads a Google script itself', () => {
    expect(script).not.toContain('googletagmanager');
  });
});

/**
 * The bootstrap script, actually run.
 *
 * Asserting on its text catches a typo; running it catches the things that
 * only appear at runtime — a cookie regex that matches the wrong cookie, a
 * parse that throws on someone else's cookie value, commands reaching the data
 * layer in the wrong order. There is no DOM in this suite, so the two globals
 * it touches are stubbed and the script is evaluated directly. That is the
 * same code path the browser takes, because the string under test is the
 * string that ships in the page.
 */
function runBootstrap(cookieHeader: string): unknown[][] {
  const window: Record<string, unknown> = {};
  const document = { cookie: cookieHeader };
  new Function('window', 'document', consentBootstrapScript())(window, document);
  // Commands arrive as `arguments` objects, which compare badly; normalise.
  return (window.dataLayer as ArrayLike<unknown>[]).map((entry) => Array.from(entry));
}

describe('the bootstrap script, executed', () => {
  it('denies everything when no consent cookie is present', () => {
    const commands = runBootstrap('NEXT_LOCALE=tr; theme=dark');
    expect(commands).toEqual([
      ['consent', 'default', { ...DEFAULT_GOOGLE_CONSENT, wait_for_update: 500 }],
      ['set', 'ads_data_redaction', true],
      ['set', 'url_passthrough', true],
    ]);
  });

  it('restores a returning visitor, defaults first and update second', () => {
    const value = serializeConsent({ version: CONSENT_VERSION, at: 0, choices: GRANT_ALL });
    const commands = runBootstrap(`NEXT_LOCALE=en; ${CONSENT_COOKIE}=${value}`);

    expect(commands[0][1]).toBe('default');
    expect(commands.at(-2)).toEqual(['consent', 'update', googleConsentFor(GRANT_ALL)]);
    expect(commands.at(-1)).toEqual(['set', 'ads_data_redaction', false]);
  });

  it('keeps redaction on for a visitor who allowed only measurement', () => {
    const choices = { ads: false, analytics: true };
    const value = serializeConsent({ version: CONSENT_VERSION, at: 0, choices });
    const commands = runBootstrap(`${CONSENT_COOKIE}=${value}`);

    expect(commands.at(-1)).toEqual(['consent', 'update', googleConsentFor(choices)]);
    expect(commands).toContainEqual(['set', 'ads_data_redaction', true]);
  });

  it('does not match a cookie whose name merely ends with ours', () => {
    const value = serializeConsent({ version: CONSENT_VERSION, at: 0, choices: GRANT_ALL });
    const commands = runBootstrap(`not_${CONSENT_COOKIE}=${value}`);
    expect(commands.some((entry) => entry[1] === 'update')).toBe(false);
  });

  it('issues no update when the stored value is corrupt, rather than throwing', () => {
    const commands = runBootstrap(`${CONSENT_COOKIE}=%7Bnot-json`);
    expect(commands.some((entry) => entry[1] === 'update')).toBe(false);
    expect(commands[0][1]).toBe('default');
  });
});

/**
 * Where a sign-in chain is allowed to end up.
 *
 * The public pricing cards send a visitor to signup carrying the plan they
 * clicked, and signup, login and onboarding hand that destination on until the
 * user lands on it. The destination therefore travels through a query string,
 * which anyone can write — so it is validated here rather than trusted, and
 * this module is the only place that decides what counts as acceptable.
 *
 * The rule is deliberately narrow: an internal path and nothing else. No host,
 * no scheme, no protocol-relative form. `//evil.com` and `https://evil.com` are
 * both a navigation off this site, and `\` is rejected because browsers
 * normalise a backslash to a forward slash while parsing a URL, which turns
 * `/\evil.com` into `//evil.com` — an open redirect that reads like a path.
 * Control characters are rejected for the same reason: some browsers strip tabs
 * and newlines before parsing, so `/<tab>/evil.com` is not what it looks like.
 *
 * Anything that fails falls back to the caller's default. A visitor who tampers
 * with the parameter simply arrives at the dashboard.
 *
 * Note that the middleware writes an absolute `req.url` into `callbackUrl` when
 * it bounces a signed-out request to login. That form is rejected here and the
 * caller's default is used, which is exactly what login did before this
 * existed — it ignored the parameter altogether.
 *
 * Pure and dependency-free on purpose: it is used from three client pages and
 * covered by unit tests without a browser or a router.
 */

/** Characters a browser may strip or normalise before parsing a URL. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** True when `value` is a path this application may navigate to. */
export function isSafeRedirectPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const path = value.trim();
  if (path === '') return false;

  // Must be a path on this site, not a host and not a scheme.
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;

  // A backslash anywhere can become a second leading slash once a browser
  // normalises the URL; a control character can vanish before parsing.
  if (path.includes('\\')) return false;
  if (CONTROL_CHARACTERS.test(path)) return false;

  return true;
}

/**
 * The redirect target to use: the requested path when it is safe, otherwise the
 * caller's own default.
 */
export function safeRedirectPath(value: unknown, fallback: string): string {
  return isSafeRedirectPath(value) ? value.trim() : fallback;
}

/**
 * `href` with a `callbackUrl` carrying the destination on.
 *
 * Used by the links between signup and login, and by signup when it hands the
 * chain to onboarding: without this a user who followed a plan link loses it
 * the moment they switch form, and lands on the dashboard having been promised
 * a checkout. An absent or unsafe destination leaves `href` untouched.
 */
export function withCallbackUrl(href: string, callbackUrl: unknown): string {
  if (!isSafeRedirectPath(callbackUrl)) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}callbackUrl=${encodeURIComponent(callbackUrl.trim())}`;
}

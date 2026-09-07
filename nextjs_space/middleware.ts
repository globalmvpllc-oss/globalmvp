import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, clientKey, LOGIN_RULE } from '@/lib/rate-limit';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n';
import { detectLocale, withLocaleCookie, type LocaleDecision } from '@/lib/i18n/detect';

/**
 * Custom middleware: returns 401 JSON for unauthenticated API requests,
 * redirects to login for unauthenticated page requests, and gives a first-time
 * visitor a language before their first page is rendered.
 */

/**
 * Paths that get a language stamped on them.
 *
 * Documents only. A static chunk, an icon, `robots.txt` and `sitemap.xml` are
 * the same bytes in every language, and attaching a cookie — or the
 * `Cache-Control` that has to come with it — to those responses would take them
 * out of the CDN for no gain. An API response is excluded for the same reason:
 * it is fetched by a page that already carries the cookie.
 */
function isDocumentRequest(pathname: string): boolean {
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/og-image')
  ) {
    return false;
  }
  return pathname !== '/robots.txt' && pathname !== '/sitemap.xml';
}

/**
 * Appends a field to Vary without dropping whatever was already there.
 *
 * Worth knowing, and verified against a production build rather than assumed:
 * Next replaces `Vary` on an app-router page response with its own
 * (`RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept-Encoding`), so
 * what is set here survives on a redirect but not on a rendered page. That is
 * why `Cache-Control` below is the protection and this is only the label — a
 * `Vary` that a framework may overwrite is not something to rely on.
 */
function addVary(response: NextResponse, field: string): void {
  const existing = response.headers.get('Vary');
  const fields = existing ? existing.split(',').map((value) => value.trim()) : [];
  if (!fields.some((value) => value.toLowerCase() === field.toLowerCase())) {
    fields.push(field);
  }
  response.headers.set('Vary', fields.filter(Boolean).join(', '));
}

/**
 * Writes the detected language onto a response, and stops that response being
 * shared.
 *
 * This is the one way this feature can fail in production while looking
 * perfect locally. A response produced by detection depends on the visitor's
 * country and their `Accept-Language`, and it carries a `Set-Cookie` naming a
 * language. If a shared cache ever kept one, the next cookie-less visitor would
 * be served the previous visitor's language *and* their cookie.
 *
 * `Vary` cannot express the whole dependency, twice over: the country arrives
 * as a platform-injected value rather than as a header the visitor sent, so no
 * `Vary` field describes it, and Next overwrites `Vary` on page responses in
 * any case (see `addVary`). `Cache-Control` is therefore what actually does the
 * work here — these responses are kept out of shared caches entirely, which
 * costs nothing, because detection runs once per visitor and never again.
 *
 * Every route in this application is already rendered on demand (`ƒ` in the
 * build output; the root layout reads `cookies()`, which opts the whole tree
 * out of static rendering) and Next already answers them
 * `private, no-cache, no-store, max-age=0, must-revalidate`. So nothing would
 * have cached them today either way. This makes the safety explicit instead of
 * inherited, and it keeps holding if a page is ever made static later.
 */
function stampLocale(response: NextResponse, decision: LocaleDecision): NextResponse {
  response.cookies.set(LOCALE_COOKIE, decision.locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  response.headers.set('Cache-Control', 'private, no-store');
  addVary(response, 'Accept-Language');
  addVary(response, 'Cookie');
  return response;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /**
   * The language for this request.
   *
   * `shouldPersist` is false whenever the cookie already held a valid locale,
   * so an explicit choice is read and left alone: nothing below rewrites it,
   * and none of the cache headers above are applied to a request that carries
   * one. The language switcher therefore keeps working exactly as it did.
   *
   * The country is whatever the platform put on the request. On Vercel that is
   * `req.geo`, with the header it is derived from as the fallback so a
   * different host that sets only the header still works. Nothing here parses
   * an IP address.
   */
  const locale: LocaleDecision = detectLocale({
    cookie: req.cookies.get(LOCALE_COOKIE)?.value,
    country: req.geo?.country ?? req.headers.get('x-vercel-ip-country'),
    acceptLanguage: req.headers.get('accept-language'),
  });

  const detecting = locale.shouldPersist && isDocumentRequest(pathname);

  /**
   * Continue to the page, with the decided language already on the request.
   *
   * The cookie is rewritten into the *request* headers, not only set on the
   * response: a `Set-Cookie` is not visible to the render that produced it, so
   * without this a Turkish visitor would be served an English first page and
   * Turkish only after a navigation. Rewriting the request means
   * `getServerLocale()` reads the decided value on this very request, and the
   * client hydrates from the same value — no header reaches the renderer, and
   * there is nothing for hydration to disagree about.
   */
  const proceed = (): NextResponse => {
    if (!detecting) return NextResponse.next();

    const headers = new Headers(req.headers);
    headers.set('cookie', withLocaleCookie(req.headers.get('cookie'), locale.locale));
    return stampLocale(NextResponse.next({ request: { headers } }), locale);
  };

  /** Any other response — a redirect, a 401 — still carries the decision. */
  const finish = (response: NextResponse): NextResponse =>
    detecting ? stampLocale(response, locale) : response;

  // Public marketing and legal pages. Exact matches only — these must not
  // widen access to any protected application route.
  const PUBLIC_PAGES = new Set([
    '/',
    '/pricing',
    // Search-ad landing pages. Exact matches only, like every entry here, so a
    // protected route cannot be opened by sharing a prefix with a public one.
    '/finance',
    '/invoicing',
    '/expense-tracking',
    '/contact',
    '/privacy',
    '/terms',
    '/cookies',
    '/kvkk',
    '/refund',
    '/robots.txt',
    '/sitemap.xml',
  ]);

  // Allow public routes
  // Credentials sign-in is the one unauthenticated POST NextAuth exposes.
  // authorize() receives no Request, so the limiter is applied here, where the
  // client address is available. Only the POST is limited: session and provider
  // GETs are used on every page load.
  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const limit = checkRateLimit(clientKey(req, 'login'), LOGIN_RULE);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }
  }

  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/signup') ||
    // Provider webhooks carry no session cookie, so the session gate below
    // would reject every delivery with a 401 and the sender would eventually
    // stop retrying — subscriptions would drift out of sync silently. These
    // routes authenticate the request themselves by verifying the provider's
    // signature over the raw body, which is the correct check here; a session
    // would be the wrong one.
    pathname.startsWith('/api/webhooks/') ||
    PUBLIC_PAGES.has(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/og-image')
  ) {
    return proceed();
  }

  const token = await getToken({ req });
  if (!token) {
    // API routes: return 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page routes: redirect to login. The decision rides along, so the login
    // page it lands on is already in the visitor's language.
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    return finish(NextResponse.redirect(loginUrl));
  }

  return proceed();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg|og-image\\.png).*)'],
};

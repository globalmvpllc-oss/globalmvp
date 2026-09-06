import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, clientKey, LOGIN_RULE } from '@/lib/rate-limit';

/**
 * Custom middleware: returns 401 JSON for unauthenticated API requests,
 * and redirects to login for unauthenticated page requests.
 */
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (!token) {
    // API routes: return 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page routes: redirect to login
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg|og-image\\.png).*)'],
};

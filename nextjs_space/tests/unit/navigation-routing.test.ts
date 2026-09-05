import { describe, it, expect } from 'vitest';
import { en, tr, translate } from '@/lib/i18n';

/**
 * Navigation and public routing.
 *
 * Two things here are easy to regress and awkward to notice: two sidebar items
 * lighting up at once, and the root route quietly becoming the application
 * again for signed-in visitors.
 */

/** Mirrors the sidebar's NAV_ITEMS destinations, in order. */
const NAV_HREFS = [
  '/dashboard',
  '/invoices',
  '/customers',
  '/income',
  '/expenses',
  '/payments',
  '/banking',
  '/calendar',
  '/reports',
  '/settings',
  '/settings/billing',
];

/** Mirrors the sidebar's active rule. */
function isActive(itemHref: string, pathname: string): boolean {
  return (
    pathname === itemHref ||
    (pathname.startsWith(itemHref + '/') &&
      !NAV_HREFS.some((other) => other !== itemHref && pathname === other))
  );
}

describe('billing is a navigation item', () => {
  it('is present exactly once', () => {
    expect(NAV_HREFS.filter((h) => h === '/settings/billing')).toHaveLength(1);
  });

  it('points at the existing billing page rather than a new route', () => {
    expect(NAV_HREFS).toContain('/settings/billing');
  });

  it('sits after Settings', () => {
    expect(NAV_HREFS.indexOf('/settings/billing')).toBe(NAV_HREFS.indexOf('/settings') + 1);
  });

  it('has a short label in both languages', () => {
    expect(en['nav.billing']).toBe('Billing');
    expect(translate('tr', 'nav.billing')).toBe('Faturalama');
  });

  it('translates rather than copying English', () => {
    expect(tr['nav.billing']).not.toBe(en['nav.billing']);
  });
});

describe('only one navigation item is active at a time', () => {
  it('highlights Billing on the billing page', () => {
    expect(isActive('/settings/billing', '/settings/billing')).toBe(true);
  });

  it('does not also highlight Settings on the billing page', () => {
    // The plain prefix rule would light up both, since /settings/billing
    // starts with /settings/.
    expect(isActive('/settings', '/settings/billing')).toBe(false);
  });

  it('highlights Settings on the settings page', () => {
    expect(isActive('/settings', '/settings')).toBe(true);
    expect(isActive('/settings/billing', '/settings')).toBe(false);
  });

  it('still highlights a parent for a descendant that is not its own item', () => {
    // Invoice detail pages have no navigation entry, so Invoices stays lit.
    expect(isActive('/invoices', '/invoices/inv-123')).toBe(true);
  });

  it.each(NAV_HREFS)('exactly one item is active for %s', (pathname) => {
    const active = NAV_HREFS.filter((href) => isActive(href, pathname));
    expect(active).toHaveLength(1);
    expect(active[0]).toBe(pathname);
  });
});

describe('public and protected routing', () => {
  /** Mirrors middleware: exact-match public pages plus prefix exemptions. */
  const PUBLIC_PAGES = new Set([
    '/',
    '/pricing',
    '/contact',
    '/privacy',
    '/terms',
    '/cookies',
    '/kvkk',
  ]);

  const isPublic = (pathname: string) =>
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/api/webhooks/') ||
    PUBLIC_PAGES.has(pathname);

  it('serves the root route without a session', () => {
    expect(isPublic('/')).toBe(true);
  });

  it.each(['/auth/login', '/auth/signup', '/pricing'])('leaves %s public', (path) => {
    expect(isPublic(path)).toBe(true);
  });

  it.each(['/dashboard', '/invoices', '/settings', '/settings/billing', '/api/company'])(
    'keeps %s protected',
    (path) => {
      expect(isPublic(path)).toBe(false);
    }
  );

  it('does not make every /settings path public just because / is', () => {
    // Exact-match membership, not a prefix: '/' must not open the app.
    expect(isPublic('/settings/billing')).toBe(false);
  });
});

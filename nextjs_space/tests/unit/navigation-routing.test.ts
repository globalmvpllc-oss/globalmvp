import { describe, it, expect } from 'vitest';
import { en, tr, translate } from '@/lib/i18n';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { SUPPORT_LINK, LEGAL_LINKS } from '@/lib/app-support-links';

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

describe('support and legal pages are reachable from the application', () => {
  const root = path.resolve(__dirname, '../..');
  const sidebar = readFileSync(path.join(root, 'components/app-sidebar.tsx'), 'utf8');
  const middleware = readFileSync(path.join(root, 'middleware.ts'), 'utf8');

  /** One top-level function in the sidebar, up to its closing brace at column 0. */
  const functionBody = (name: string) => {
    const source = sidebar.replace(/\r\n/g, '\n');
    const start = source.indexOf(`function ${name}(`);
    expect(start, `${name} exists`).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n}\n', start));
  };

  /** The NAV_ITEMS array literal: the feature navigation group. */
  const navItems = sidebar.slice(
    sidebar.indexOf('const NAV_ITEMS = ['),
    sidebar.indexOf('];', sidebar.indexOf('const NAV_ITEMS = ['))
  );

  it('points the support link at /contact', () => {
    expect(SUPPORT_LINK.href).toBe('/contact');
  });

  it('is not inside the feature navigation group', () => {
    expect(navItems).not.toContain("'/contact'");
    expect(navItems).not.toContain('SUPPORT_LINK');
    expect(NAV_HREFS).not.toContain('/contact');
    for (const link of LEGAL_LINKS) expect(NAV_HREFS).not.toContain(link.href);
  });

  it('renders the support link in the account-level footer', () => {
    const footer = functionBody('SidebarFooterActions');
    expect(footer).toContain('href={SUPPORT_LINK.href}');
    // Support sits above the language selector and Sign out.
    expect(footer.indexOf('SUPPORT_LINK.href')).toBeLessThan(footer.indexOf('<LanguageSelector'));
    expect(footer.indexOf('SUPPORT_LINK.href')).toBeLessThan(footer.indexOf('signOut('));
    expect(functionBody('SidebarNav')).not.toContain('SUPPORT_LINK');
  });

  it('keeps the support link in both the expanded and collapsed sidebar', () => {
    const footer = functionBody('SidebarFooterActions');
    const link = footer.slice(footer.indexOf('<Link'), footer.indexOf('</Link>'));
    // The link itself is never gated on `collapsed`; only its text label is.
    const before = footer.slice(footer.indexOf('return ('), footer.indexOf('<Link'));
    expect(before).not.toMatch(/collapsed\s*(&&|\?)/);
    expect(link).toContain('{!collapsed && <span>{supportLabel}</span>}');
    // Collapsed, the icon still needs a name.
    expect(link).toContain('aria-label={collapsed ? supportLabel : undefined}');
    // The persistent sidebar passes its collapsed state; the drawer is expanded.
    expect(sidebar).toContain('<SidebarFooterActions collapsed={collapsed} t={t} />');
    expect(sidebar).toMatch(/<SidebarFooterActions collapsed=\{false\} onNavigate=/);
  });

  it('has a support label in both languages', () => {
    expect(en['nav.support']).toBeTruthy();
    expect(tr['nav.support']).toBeTruthy();
    expect(tr['nav.support']).not.toBe(en['nav.support']);
  });

  it('offers the refund policy alongside privacy and terms', () => {
    expect(LEGAL_LINKS.map((l) => l.href)).toEqual(['/privacy', '/terms', '/refund']);
  });

  it.each([SUPPORT_LINK, ...LEGAL_LINKS].map((l) => [l.href, l.labelKey]))(
    '%s resolves to a real public page with a label',
    (href, labelKey) => {
      expect(existsSync(path.join(root, 'app', href.slice(1), 'page.tsx'))).toBe(true);
      // Public, so the link works even if the session has just expired.
      expect(middleware).toContain(`'${href}',`);
      expect(en[labelKey as keyof typeof en]).toBeTruthy();
      expect(tr[labelKey as keyof typeof tr]).toBeTruthy();
    }
  );
});

/**
 * Account-level destinations in the application shell.
 *
 * Kept apart from the sidebar's feature navigation on purpose: support and the
 * legal pages are not features of the product, so they sit in the sidebar
 * footer next to the language selector and Sign out rather than among
 * Invoices, Customers and the rest.
 *
 * Every href here is an existing public page (see PUBLIC_PAGES in
 * middleware.ts), so a plain link works whether or not the session is valid.
 *
 * Labels are translation keys, resolved at render time like NAV_ITEMS.
 */
export const SUPPORT_LINK = { href: '/contact', labelKey: 'nav.support' } as const;

/**
 * The policies a paying customer is most likely to need while signed in.
 *
 * Cookies and KVKK stay in the marketing footer, which /contact itself renders,
 * so they remain one click from the support link.
 */
export const LEGAL_LINKS = [
  { href: '/privacy', labelKey: 'nav.privacy' },
  { href: '/terms', labelKey: 'nav.terms' },
  { href: '/refund', labelKey: 'nav.refund' },
] as const;

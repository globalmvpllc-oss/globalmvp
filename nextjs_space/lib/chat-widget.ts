/**
 * Where the Webtochat support bubble may appear: the public pages only (home,
 * pricing, ad landing pages, contact, legal pages, sign-in and sign-up).
 * Never inside the signed-in application or on any KolayStok screen —
 * there it would sit over buttons people use one-handed.
 */
export const CHAT_WIDGET_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/pricing',
  '/finance',
  '/invoicing',
  '/expense-tracking',
  '/contact',
  '/privacy',
  '/terms',
  '/cookies',
  '/kvkk',
  '/refund',
]);

/** The elements the widget adds to <body> (see Webtochat's /api/widget.js). */
export const CHAT_WIDGET_ELEMENT_IDS = ['ai-chatbot-widget', 'ai-greet'] as const;

export function showsChatWidget(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return CHAT_WIDGET_PAGES.has(path) || path === '/auth' || path.startsWith('/auth/');
}

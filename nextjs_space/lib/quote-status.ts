import type { TranslationKey } from '@/lib/i18n';

/**
 * Quote (teklif) lifecycle. Pure, unit-tested.
 *
 *   DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED
 *
 * - SENT is set when the quote is emailed (or marked sent by hand).
 * - EXPIRED is set by the daily cron once validUntil has passed.
 * - An expired quote can still be accepted: a customer who says yes a day
 *   late is still a yes.
 * - Converting to an invoice is allowed from DRAFT, SENT, ACCEPTED or EXPIRED,
 *   exactly once, and leaves the quote ACCEPTED.
 */
export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  EXPIRED: ['ACCEPTED', 'REJECTED', 'SENT'],
  ACCEPTED: [],
  REJECTED: [],
};

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function canTransitionQuote(from: string, to: string): boolean {
  if (!isQuoteStatus(from) || !isQuoteStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function canConvertQuote(quote: { status: string; convertedInvoiceId?: string | null }): boolean {
  if (quote.convertedInvoiceId) return false;
  return ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'].includes(quote.status);
}

/** Line items can be changed only while the quote is a draft. */
export function canEditQuote(quote: { status: string; convertedInvoiceId?: string | null }): boolean {
  return quote.status === 'DRAFT' && !quote.convertedInvoiceId;
}

export const QUOTE_STATUS_BADGES: Record<QuoteStatus, { labelKey: TranslationKey; color: string }> = {
  DRAFT: { labelKey: 'quotes.status.draft', color: 'bg-gray-100 text-gray-700' },
  SENT: { labelKey: 'quotes.status.sent', color: 'bg-blue-100 text-blue-700' },
  ACCEPTED: { labelKey: 'quotes.status.accepted', color: 'bg-green-100 text-green-700' },
  REJECTED: { labelKey: 'quotes.status.rejected', color: 'bg-red-100 text-red-700' },
  EXPIRED: { labelKey: 'quotes.status.expired', color: 'bg-amber-100 text-amber-700' },
};

export function quoteStatusBadge(status: unknown) {
  return isQuoteStatus(status) ? QUOTE_STATUS_BADGES[status] : QUOTE_STATUS_BADGES.DRAFT;
}

/** Default number prefix when the company has not chosen one. */
export function defaultQuotePrefix(country: unknown): string {
  return typeof country === 'string' && country.toUpperCase() === 'TR' ? 'TKL-' : 'QUO-';
}

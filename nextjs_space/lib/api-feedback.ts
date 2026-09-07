import { DEFAULT_LOCALE, translate, type Locale, type TranslationKey } from '@/lib/i18n';

/**
 * Reading an API response honestly.
 *
 * The edit and delete flows added in this change move money records, so a
 * request that fails must never be reported as success — a user told their
 * payment was corrected when it was not will trust books that are wrong.
 *
 * Pure, so the message selection can be unit-tested without a DOM.
 *
 * ## Locale
 *
 * Every function takes an optional locale and defaults to English, so an
 * existing caller that passes none behaves exactly as it did. Client pages pass
 * the active locale from `useI18n()`, which is what turns these fallbacks
 * Turkish.
 *
 * What this cannot translate is a message the API itself wrote. Those arrive
 * already rendered in English from `app/api/**`, which has no locale, and they
 * win over these fallbacks precisely because they are specific — "Payment
 * amount exceeds remaining balance. Maximum: 120.00" tells the user far more
 * than any sentence here. Translating them means giving the API routes a
 * locale, which is a separate change to a separate layer.
 */

const STATUS_KEYS: Record<number, TranslationKey> = {
  400: 'error.badRequest',
  401: 'error.unauthorized',
  403: 'error.forbidden',
  404: 'error.notFound',
  409: 'error.conflict',
  429: 'error.tooManyRequests',
};

/** Status fallbacks, phrased so the reader knows what to do next. */
export function messageForStatus(status: number, locale: Locale = DEFAULT_LOCALE): string {
  const key =
    STATUS_KEYS[status] ?? (status >= 500 ? 'error.server' : 'error.generic');
  return translate(locale, key);
}

/**
 * Messages that name the failure but not the cause. The API returns some of
 * these as a generic fallback; showing them verbatim tells the user nothing.
 */
const UNINFORMATIVE = new Set([
  'failed',
  'error',
  'validation failed',
  'unauthorized',
  'forbidden',
  'not found',
  'bad request',
  'internal server error',
  'no company access',
]);

function isInformative(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !UNINFORMATIVE.has(value.trim().toLowerCase())
  );
}

/**
 * Picks the message to show for a failed response body.
 *
 * The API's own text wins when it is specific — "Payment amount exceeds
 * remaining balance. Maximum: 120.00" is far more useful than any generic
 * sentence this module could produce.
 */
export function pickErrorMessage(
  status: number,
  body: unknown,
  locale: Locale = DEFAULT_LOCALE
): string {
  const record = (body ?? {}) as Record<string, unknown>;
  if (isInformative(record.message)) return record.message;
  if (isInformative(record.error)) return record.error;
  return messageForStatus(status, locale);
}

/** Reads a failed Response. Never throws, so an error toast can never be skipped. */
export async function readErrorMessage(
  response: Response,
  locale: Locale = DEFAULT_LOCALE
): Promise<string> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return messageForStatus(response.status, locale);
  }
  return pickErrorMessage(response.status, body, locale);
}

/** For a request that never reached the server at all. */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

/** The same message in the reader's language. */
export function networkErrorMessage(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, 'error.network');
}

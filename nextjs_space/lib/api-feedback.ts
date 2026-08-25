/**
 * Reading an API response honestly.
 *
 * The edit and delete flows added in this change move money records, so a
 * request that fails must never be reported as success — a user told their
 * payment was corrected when it was not will trust books that are wrong.
 *
 * Pure, so the message selection can be unit-tested without a DOM.
 */

/** Status fallbacks, phrased so the reader knows what to do next. */
export function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Please check the details and try again.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return "You don't have access to this business.";
    case 404:
      return 'That record no longer exists.';
    case 409:
      return 'This record was changed somewhere else. Reload the page and try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      if (status >= 500) return 'Something went wrong on our server. Please try again.';
      return 'That request could not be completed. Please try again.';
  }
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
export function pickErrorMessage(status: number, body: unknown): string {
  const record = (body ?? {}) as Record<string, unknown>;
  if (isInformative(record.message)) return record.message;
  if (isInformative(record.error)) return record.error;
  return messageForStatus(status);
}

/** Reads a failed Response. Never throws, so an error toast can never be skipped. */
export async function readErrorMessage(response: Response): Promise<string> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return messageForStatus(response.status);
  }
  return pickErrorMessage(response.status, body);
}

/** For a request that never reached the server at all. */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

/**
 * PDF job tokens.
 *
 * The PDF status endpoint used to accept a raw Abacus `request_id`, which meant
 * any authenticated user who knew (or guessed) another company's request id
 * could download that company's invoice PDF.
 *
 * Instead of storing job ownership in the database (which would require a schema
 * change), we hand the client an HMAC-signed token that binds the request id to
 * the company that created it, plus an expiry. The status endpoint verifies the
 * signature, checks the expiry, and confirms the embedded companyId matches the
 * caller's session before it will talk to Abacus.
 */

const TOKEN_TTL_SECONDS = 15 * 60; // PDF polling gives up long before this

interface PdfTokenPayload {
  rid: string; // Abacus request_id
  cid: string; // companyId
  exp: number; // unix seconds
  jti: string; // unique id, keeps tokens distinct for identical inputs
}

function getSigningSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail closed. Never fall back to a default/guessable secret.
    throw new Error('NEXTAUTH_SECRET is not configured');
  }
  return secret;
}

function sign(data: string): string {
  return createHmac('sha256', getSigningSecret()).update(data).digest('base64url');
}

/** Creates a signed token for a freshly created PDF job. */
export function createPdfToken(requestId: string, companyId: string): string {
  const payload: PdfTokenPayload = {
    rid: requestId,
    cid: companyId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export type PdfTokenResult =
  | { ok: true; requestId: string; companyId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verifies a token's signature and expiry.
 * Does NOT check company membership — the caller must compare `companyId`
 * against the session's company.
 */
export function verifyPdfToken(token: unknown): PdfTokenResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return { ok: false, reason: 'malformed' };
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return { ok: false, reason: 'malformed' };
  }

  const body = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);

  let expectedSignature: string;
  try {
    expectedSignature = sign(body);
  } catch {
    // Missing secret — treat as unverifiable rather than throwing to the client.
    return { ok: false, reason: 'bad_signature' };
  }

  const providedBuf = Buffer.from(providedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: PdfTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    typeof payload?.rid !== 'string' ||
    typeof payload?.cid !== 'string' ||
    typeof payload?.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, requestId: payload.rid, companyId: payload.cid };
}

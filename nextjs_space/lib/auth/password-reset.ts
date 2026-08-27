import { createHash, randomBytes } from 'crypto';
import { PASSWORD_MIN, PASSWORD_MAX } from '@/lib/validation';

/**
 * Password reset, the pure half.
 *
 * No Prisma, no network, no Resend — just the token maths and the rules, so
 * every branch can be tested directly. The routes do the I/O.
 *
 * Only the SHA-256 hash of a token is ever stored. The token itself is 32 random
 * bytes — 256 bits of entropy — so a slow hash (bcrypt) buys nothing here: there
 * is no low-entropy secret to make expensive to guess. SHA-256 keeps a leaked
 * database dump from yielding a working link, which is the whole point.
 */

/** How long a reset link is valid: one hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** A fresh reset token: 32 random bytes as hex. */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/** The value stored for a token. Never store the token itself. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type ResetTokenState = 'valid' | 'expired' | 'already-used' | 'unknown';

/** The stored columns the check needs — structural, not the Prisma type. */
export interface StoredResetToken {
  usedAt: Date | string | null;
  expiresAt: Date | string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Classifies a stored token.
 *
 * `usedAt` is checked BEFORE expiry: a spent link that has also aged out is
 * "already-used", the more precise fact. An unparseable expiry counts as expired
 * — failing closed for a corrupt row rather than treating it as valid.
 *
 * The routes collapse `expired`, `already-used` and `unknown` into one message
 * so a caller cannot tell a real-but-stale token from one that never existed.
 */
export function verifyResetToken(
  stored: StoredResetToken | null | undefined,
  now: Date = new Date()
): ResetTokenState {
  if (!stored) return 'unknown';
  if (stored.usedAt) return 'already-used';
  const expiry = toDate(stored.expiresAt);
  if (!expiry) return 'expired';
  if (expiry.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export type PasswordCheckResult =
  | { ok: true }
  | { ok: false; reason: 'too-short' | 'too-long' | 'mismatch' };

/**
 * The same bounds as signup, imported from one place so the two cannot diverge.
 */
export function checkNewPassword(password: unknown, confirmation: unknown): PasswordCheckResult {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return { ok: false, reason: 'too-short' };
  }
  if (password.length > PASSWORD_MAX) return { ok: false, reason: 'too-long' };
  if (password !== confirmation) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/**
 * Builds an absolute auth link from a trusted base URL.
 *
 * The base is NEXTAUTH_URL, never anything from the request: an attacker who can
 * set a Host header must not be able to point the emailed link at their own
 * domain. An http URL is refused unless it is localhost, so a token never ships
 * in cleartext in production.
 */
export function buildAuthUrl(path: string, token: string, baseUrl: string | null | undefined): string {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Base URL is not configured');
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Base URL is not a valid URL');
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('Refusing to build a non-HTTPS auth URL');
  }
  url.pathname = path;
  url.search = `token=${encodeURIComponent(token)}`;
  url.hash = '';
  return url.toString();
}

/** The reset link a user follows from their email. */
export function buildResetUrl(token: string, baseUrl: string | null | undefined): string {
  return buildAuthUrl('/auth/reset-password', token, baseUrl);
}

import { buildAuthUrl } from './password-reset';

/**
 * Email verification, the pure half.
 *
 * Reuses the reset token primitives (generateResetToken, hashResetToken,
 * verifyResetToken) — the only differences are the TTL and the link path, so
 * they live here and everything else is shared. Verification is never required
 * to sign in, so a lapsed token locks nobody out.
 */

/** A verification link is valid for 24 hours. */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** The link a user follows from their verification email. */
export function buildVerifyUrl(token: string, baseUrl: string | null | undefined): string {
  return buildAuthUrl('/auth/verify-email', token, baseUrl);
}

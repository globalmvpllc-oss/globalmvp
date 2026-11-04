import { timingSafeEqual } from 'crypto';

/**
 * Checks the `Authorization: Bearer <CRON_SECRET>` header Vercel Cron sends.
 *
 * Fails closed: with no secret configured nothing is accepted. Constant-time
 * comparison so the secret cannot be guessed a character at a time.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  if (!authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const given = Buffer.from(authorization, 'utf8');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

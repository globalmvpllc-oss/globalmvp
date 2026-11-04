import { createHmac, timingSafeEqual } from 'crypto';
import { STAFF_SESSION_DAYS } from './rules';

/**
 * The warehouse staff session: a signed cookie, not an account.
 *
 * Staff sign in with their name and a 4-digit PIN on the company's own
 * KolayStok link. The cookie carries only the staff id, the company id and
 * an expiry (30 days), signed with the server secret; every request then
 * re-reads the staff row, so deactivating someone or changing their PIN
 * (which bumps `sessionVersion`, carried as `v`) ends their session at once.
 */
export const STAFF_COOKIE = 'ks_staff';
export const STAFF_SESSION_MAX_AGE = STAFF_SESSION_DAYS * 24 * 60 * 60;

export interface StaffToken {
  sid: string;
  cid: string;
  /** The staff row's sessionVersion at sign-in. */
  v: number;
  exp: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('NEXTAUTH_SECRET is not set');
  return value;
}

function sign(body: string, key: string): string {
  return createHmac('sha256', key).update(`ks-staff:${body}`).digest('base64url');
}

export function encodeStaffToken(token: StaffToken, key: string = secret()): string {
  const body = Buffer.from(JSON.stringify(token)).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** The token if the signature is right and it has not expired; otherwise null. */
export function decodeStaffToken(value: unknown, now: number = Date.now(), key: string = secret()): StaffToken | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const token = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StaffToken;
    if (typeof token?.sid !== 'string' || typeof token?.cid !== 'string' || typeof token?.exp !== 'number') return null;
    if (token.exp <= now) return null;
    return token;
  } catch {
    return null;
  }
}

export function newStaffToken(staff: { id: string; companyId: string; sessionVersion: number }, now: number = Date.now()): StaffToken {
  return { sid: staff.id, cid: staff.companyId, v: staff.sessionVersion, exp: now + STAFF_SESSION_MAX_AGE * 1000 };
}

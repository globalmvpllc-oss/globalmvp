import { describe, it, expect } from 'vitest';
import {
  RESET_TOKEN_TTL_MS,
  generateResetToken,
  hashResetToken,
  verifyResetToken,
  checkNewPassword,
  buildResetUrl,
} from '@/lib/auth/password-reset';
import { buildVerifyUrl } from '@/lib/auth/email-verification';
import { PASSWORD_MIN, PASSWORD_MAX } from '@/lib/validation';

/**
 * Password reset, the parts that must be right before any database is involved:
 * token generation and single-use, the expiry boundary, failing closed on a
 * corrupt row, the password bounds matching signup, and refusing to email a
 * non-HTTPS link.
 */

describe('token generation and hashing', () => {
  it('generates 32 random bytes as 64 hex characters', () => {
    expect(generateResetToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a fresh token each time', () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });

  it('hashes deterministically and never returns the token itself', () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(token)).not.toBe(token);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashResetToken('x')).not.toBe(hashResetToken('y'));
  });

  it('is a one-hour TTL', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});

const NOW = new Date('2026-06-15T12:00:00.000Z');
const future = new Date(NOW.getTime() + 60_000);
const past = new Date(NOW.getTime() - 60_000);

describe('verifyResetToken', () => {
  it('is valid for an unused, unexpired token', () => {
    expect(verifyResetToken({ usedAt: null, expiresAt: future }, NOW)).toBe('valid');
  });

  it('is unknown when there is no row', () => {
    expect(verifyResetToken(null, NOW)).toBe('unknown');
    expect(verifyResetToken(undefined, NOW)).toBe('unknown');
  });

  it('reports already-used before expiry — single use is the precise fact', () => {
    expect(verifyResetToken({ usedAt: past, expiresAt: future }, NOW)).toBe('already-used');
    expect(verifyResetToken({ usedAt: past, expiresAt: past }, NOW)).toBe('already-used');
  });

  it('treats the exact expiry instant and beyond as expired', () => {
    expect(verifyResetToken({ usedAt: null, expiresAt: NOW }, NOW)).toBe('expired');
    expect(verifyResetToken({ usedAt: null, expiresAt: past }, NOW)).toBe('expired');
  });

  it('fails closed on an unparseable or missing expiry', () => {
    expect(verifyResetToken({ usedAt: null, expiresAt: 'not-a-date' }, NOW)).toBe('expired');
    expect(verifyResetToken({ usedAt: null, expiresAt: null }, NOW)).toBe('expired');
  });
});

describe('checkNewPassword uses the same bounds as signup', () => {
  it('imports the shared bounds', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(PASSWORD_MAX).toBe(128);
  });

  it('accepts the minimum length', () => {
    const p = 'a'.repeat(PASSWORD_MIN);
    expect(checkNewPassword(p, p)).toEqual({ ok: true });
  });

  it('rejects a password below the minimum', () => {
    const p = 'a'.repeat(PASSWORD_MIN - 1);
    expect(checkNewPassword(p, p)).toEqual({ ok: false, reason: 'too-short' });
  });

  it('rejects a password above the maximum', () => {
    const p = 'a'.repeat(PASSWORD_MAX + 1);
    expect(checkNewPassword(p, p)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects a mismatch', () => {
    expect(checkNewPassword('password-one', 'password-two')).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a non-string', () => {
    expect(checkNewPassword(undefined, undefined).ok).toBe(false);
    expect(checkNewPassword(12345678, 12345678).ok).toBe(false);
  });
});

describe('buildResetUrl refuses non-HTTPS outside localhost', () => {
  it('builds an https link carrying the token', () => {
    expect(buildResetUrl('tok123', 'https://corpcontrol.net')).toBe(
      'https://corpcontrol.net/auth/reset-password?token=tok123'
    );
  });

  it('allows http on localhost for development', () => {
    expect(buildResetUrl('t', 'http://localhost:3000')).toBe(
      'http://localhost:3000/auth/reset-password?token=t'
    );
  });

  it('refuses http on a real host — a token must not ship in cleartext', () => {
    expect(() => buildResetUrl('t', 'http://corpcontrol.net')).toThrow();
  });

  it('refuses a missing or malformed base url', () => {
    expect(() => buildResetUrl('t', undefined)).toThrow();
    expect(() => buildResetUrl('t', '')).toThrow();
    expect(() => buildResetUrl('t', 'not a url')).toThrow();
  });

  it('encodes the token so it round-trips exactly', () => {
    const url = new URL(buildResetUrl('a+b/c d', 'https://x.test'));
    expect(url.searchParams.get('token')).toBe('a+b/c d');
  });

  it('buildVerifyUrl uses the verify path and the same HTTPS rule', () => {
    expect(buildVerifyUrl('t', 'https://corpcontrol.net')).toBe(
      'https://corpcontrol.net/auth/verify-email?token=t'
    );
    expect(() => buildVerifyUrl('t', 'http://corpcontrol.net')).toThrow();
  });
});

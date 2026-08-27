import { describe, it, expect } from 'vitest';
import { isSignInAllowed, isGoogleConfigured } from '@/lib/auth/oauth';

/**
 * The verified-email guard is the security-critical half of Google sign-in: it
 * is the only reason allowDangerousEmailAccountLinking is safe. These pin that a
 * Google sign-in is permitted only when Google itself has verified the address,
 * that a permitted Google sign-in is therefore verified by definition, and that
 * nothing else (credentials, future providers) is affected.
 */

describe('verified-email guard for Google', () => {
  it('allows Google only when email_verified is exactly true', () => {
    expect(isSignInAllowed({ account: { provider: 'google' }, profile: { email_verified: true } })).toBe(
      true
    );
  });

  it.each([
    ['false', { email_verified: false }],
    ['undefined', { email_verified: undefined }],
    ['missing', {}],
    ['null profile', null],
    ['a truthy non-boolean', { email_verified: 'true' }],
    ['the number 1', { email_verified: 1 }],
  ])('refuses Google when email_verified is %s', (_label, profile) => {
    expect(
      isSignInAllowed({ account: { provider: 'google' }, profile: profile as { email_verified?: unknown } | null })
    ).toBe(false);
  });

  it('a permitted Google sign-in is verified by definition', () => {
    // The single path to true for Google is email_verified === true, so any
    // Google account that signs in has been verified — which is why the account
    // is marked emailVerified and skips the verification email.
    const permitted = isSignInAllowed({
      account: { provider: 'google' },
      profile: { email_verified: true },
    });
    expect(permitted).toBe(true);
  });
});

describe('the guard applies only to Google', () => {
  it('never blocks the credentials provider', () => {
    expect(isSignInAllowed({ account: { provider: 'credentials' }, profile: null })).toBe(true);
    expect(
      isSignInAllowed({ account: { provider: 'credentials' }, profile: { email_verified: false } })
    ).toBe(true);
  });

  it('allows when there is no account or input', () => {
    expect(isSignInAllowed({ account: null, profile: null })).toBe(true);
    expect(isSignInAllowed({})).toBe(true);
  });

  it('does not gate some other future provider', () => {
    expect(
      isSignInAllowed({ account: { provider: 'github' }, profile: { email_verified: false } })
    ).toBe(true);
  });
});

describe('isGoogleConfigured', () => {
  it('is true only when both id and secret are present', () => {
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })).toBe(true);
  });

  it.each([
    {},
    { GOOGLE_CLIENT_ID: 'id' },
    { GOOGLE_CLIENT_SECRET: 'secret' },
    { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'secret' },
    { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' },
  ])('is false when incomplete (%o)', (env) => {
    expect(isGoogleConfigured(env)).toBe(false);
  });
});

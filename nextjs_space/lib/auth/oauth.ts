/**
 * OAuth sign-in rules, kept pure so they can be tested without NextAuth.
 */

/** Whether Google sign-in is configured — both the id and the secret must be set. */
export function isGoogleConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export interface SignInGuardInput {
  account?: { provider?: string | null } | null;
  profile?: { email_verified?: unknown } | null;
}

/**
 * Whether a sign-in is allowed.
 *
 * Only the Google provider is gated, and only to require that Google itself has
 * verified the address. This is exactly what makes
 * `allowDangerousEmailAccountLinking` safe: that flag links a Google sign-in to
 * an existing password account by matching email, so linking on an UNVERIFIED
 * address would let anyone who can obtain a Google token for an unverified alias
 * take over that account — the takeover the flag is named for. Requiring
 * `email_verified === true` closes it.
 *
 * Everything else — the credentials provider, and any provider added later — is
 * unaffected and returns true here.
 */
export function isSignInAllowed(input: SignInGuardInput): boolean {
  if (input.account?.provider === 'google') {
    return input.profile?.email_verified === true;
  }
  return true;
}

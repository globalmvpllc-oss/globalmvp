/**
 * Which of a user's companies is the active one.
 *
 * `CompanyMember` has always been a join table with `@@unique([userId, companyId])`,
 * so a user belonging to several companies was always representable. What was
 * missing was selection: the company was resolved with a `findFirst` that picked
 * an arbitrary membership, and a user with two companies got whichever row
 * Postgres happened to return.
 *
 * ## The cookie is a request, not an authority
 *
 * The selection is stored in a cookie, following `LOCALE_COOKIE`. That cookie is
 * readable and writable by anything running in the browser, so its value is
 * treated as a request that must be checked: `resolveActiveCompanyId` only ever
 * returns a company that appears in the membership list handed to it, which the
 * caller has already loaded from the database for this user.
 *
 * An unrecognised, revoked or tampered value therefore falls back to a company
 * the user genuinely belongs to. It never resolves to the requested company, and
 * it never resolves to an error state that would lock a user out of a company
 * they do belong to.
 *
 * Deliberately not in the JWT: a membership can be revoked, and a token would go
 * on asserting it until it expired. Reading it per request means a revocation
 * takes effect on the very next request, the same standard `user.isActive`
 * already meets.
 */

/** Cookie holding the active company id. Named like the other app cookies. */
export const ACTIVE_COMPANY_COOKIE = 'cc_active_company';

/** One year, matching the locale cookie: a workspace choice is not per-session. */
export const ACTIVE_COMPANY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A membership row, reduced to what the choice depends on. */
export interface MembershipRef {
  companyId: string;
}

/**
 * Picks the active company from the memberships the caller loaded.
 *
 * `memberships` must already be scoped to the signed-in, active user — this
 * function grants nothing on its own, it only chooses between rows that have
 * already been established as the user's.
 *
 * Order matters: callers pass memberships in a deterministic order (oldest
 * first), so a user with several companies and no cookie always lands on the
 * same one rather than on whatever the database returned first.
 *
 * @param memberships the user's verified memberships, in preference order
 * @param requested   the raw cookie value; anything at all, including undefined
 * @returns a companyId from `memberships`, or null when there are none
 */
export function resolveActiveCompanyId(
  memberships: readonly MembershipRef[],
  requested: string | null | undefined
): string | null {
  if (!memberships || memberships.length === 0) return null;

  if (typeof requested === 'string') {
    const wanted = requested.trim();
    // A match is the only way the requested value is used. An id the user has
    // no membership for falls straight through to the default below, so a
    // hand-edited cookie cannot scope a request to someone else's company.
    if (wanted !== '' && memberships.some((m) => m.companyId === wanted)) {
      return wanted;
    }
  }

  return memberships[0].companyId;
}

/**
 * Whether a stored selection was honoured.
 *
 * Lets a caller notice that a cookie pointed somewhere the user cannot go — for
 * clearing a stale cookie, or for logging — without re-deriving the decision.
 */
export function isRequestHonoured(
  memberships: readonly MembershipRef[],
  requested: string | null | undefined
): boolean {
  if (typeof requested !== 'string') return false;
  const wanted = requested.trim();
  if (wanted === '') return false;
  return memberships.some((m) => m.companyId === wanted);
}

/**
 * Writes the selection from the browser and returns it.
 *
 * The same shape as `setLocale` in the i18n provider: a document cookie rather
 * than a round trip, because the value is only a preference. `SameSite=Lax`
 * keeps it off cross-site requests. It is not `httpOnly` for the same reason
 * the locale cookie is not — nothing is granted by holding it, and every read
 * re-checks membership server-side.
 *
 * Callers must follow this with `router.refresh()` so server components
 * re-render against the new company; a stale dashboard showing the previous
 * company's figures would be worse than no switcher at all.
 */
export function writeActiveCompanyCookie(companyId: string): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${ACTIVE_COMPANY_COOKIE}=${encodeURIComponent(companyId)}; path=/; ` +
    `max-age=${ACTIVE_COMPANY_COOKIE_MAX_AGE}; SameSite=Lax`;
}

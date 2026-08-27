
/**
 * Admin authorisation rules.
 *
 * Deliberately free of Prisma and of next/server so the decisions below can be
 * tested directly. The request-time half lives in ./auth.ts.
 *
 * Three properties matter here, and each is deliberate:
 *
 *   1. The address is read from the database row, not from the session. The
 *      session carries an id and an email, but the email in a JWT is whatever
 *      was true when the token was minted. Looking the user up by id and
 *      reading their current address means a stale or forged claim grants
 *      nothing.
 *
 *   2. It fails closed. With ADMIN_EMAIL unset, nobody is an administrator —
 *      a deployment that forgot to configure it has no admin panel rather than
 *      an open one.
 *
 *   3. Nothing the client sends participates. There is no `isAdmin` field, no
 *      header and no body parameter that reaches this decision.
 */

/** The configured administrator address, normalised. Null when unset. */
export function getAdminEmail(env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.ADMIN_EMAIL;
  if (typeof configured !== 'string') return null;
  const normalised = configured.trim().toLowerCase();
  return normalised === '' ? null : normalised;
}

/**
 * Whether an address is the administrator's.
 *
 * Case and surrounding whitespace are ignored because addresses arrive in both
 * forms; nothing else is. In particular no suffix or domain matching, which is
 * how "admin@example.com.attacker.net" style bypasses happen.
 */
export function isAdminEmail(
  email: unknown,
  env: Record<string, string | undefined> = process.env
): boolean {
  const adminEmail = getAdminEmail(env);
  if (!adminEmail) return false;
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase() === adminEmail;
}

/**
 * Pagination that the client cannot use to pull the whole table.
 *
 * `page` and `pageSize` arrive as query parameters, so both are clamped: an
 * absent or absurd value becomes a sane one rather than an unbounded query.
 */
export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 100;

export function parsePagination(params: URLSearchParams): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const rawPage = Number(params.get('page'));
  const rawSize = Number(params.get('pageSize'));

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(Math.floor(rawSize), ADMIN_MAX_PAGE_SIZE)
      : ADMIN_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Trims a search term and rejects one too short to narrow anything. */
export function parseSearch(params: URLSearchParams): string | null {
  const term = (params.get('q') ?? '').trim();
  return term.length >= 2 ? term.slice(0, 100) : null;
}

/**
 * Pages from a total, never below one.
 *
 * An empty table still has a page one, so the controls have something
 * coherent to render rather than "page 1 of 0".
 */
export function totalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(Math.ceil(total / pageSize), 1);
}

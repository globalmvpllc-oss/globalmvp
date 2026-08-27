import { checkAdmin } from './auth';
import { parsePagination, parseSearch } from './access';
import { recordAudit } from './audit';
import type { AuditAction } from './audit-rules';

/**
 * The preamble every admin listing page shares.
 *
 * Authorises, parses the query safely, and records that the listing was read.
 * Each page calls this itself rather than relying on the layout: an access
 * decision made in one place and assumed in another is how a route ends up
 * unprotected after a refactor.
 */
export async function prepareAdminList(
  searchParams: Record<string, string | undefined> | undefined,
  action: AuditAction
) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const params = new URLSearchParams(
    Object.entries(searchParams ?? {}).filter(([, value]) => value !== undefined) as [
      string,
      string,
    ][]
  );

  const { page, pageSize, skip } = parsePagination(params);
  const search = parseSearch(params);

  await recordAudit({
    admin: check.admin,
    action,
    // Only the shape of the query is recorded, never the term itself: a search
    // box is a place people type customer names.
    metadata: { page, pageSize, searched: search !== null },
  });

  return { admin: check.admin, params, page, pageSize, skip, search };
}

export { totalPages } from './access';

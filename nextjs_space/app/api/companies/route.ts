export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSessionUser, getUserCompanies, getUserCompanyId } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';

/**
 * The companies the signed-in user belongs to, and which one is active.
 *
 * Feeds the sidebar switcher. Deliberately a list of memberships rather than a
 * list of companies: it is built from the same query and the same ordering that
 * `requireUserCompany` resolves through, so the switcher can only ever offer a
 * company the API would actually honour. Offering one it would not is how a
 * switcher turns into a dead end.
 *
 * Only id, name and logo are returned — enough to draw a menu entry. Nothing
 * here is a grant: picking an entry writes a cookie, and that cookie is checked
 * against membership again on the next request.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [companies, activeCompanyId] = await Promise.all([
      getUserCompanies(),
      getUserCompanyId(),
    ]);

    return NextResponse.json({ companies, activeCompanyId });
  } catch (error) {
    return handleApiError('companies:GET', error, { fallbackMessage: 'Failed to load companies' });
  }
}

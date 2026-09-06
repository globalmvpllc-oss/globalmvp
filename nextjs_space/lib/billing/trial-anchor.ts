import { prisma } from '@/lib/db';

/**
 * Which timestamp anchors a company's Pro trial.
 *
 * The trial is a chance to evaluate the product, and a person evaluates it once.
 * So the window runs from the creation date of the *earliest company its owner
 * has ever had*, not from the creation date of the company being asked about.
 *
 * ## Why this exists
 *
 * The trial used to derive from `Company.createdAt`, which was the same thing
 * while a user could hold exactly one company. Once a user can hold several,
 * anchoring per company means: create one, use Pro free for 15 days, create
 * another, repeat — unlimited Pro, never paying. The data model always allowed
 * it; making companies reachable through the interface is what made it a way in.
 *
 * ## Why it is answered from the company, not the caller
 *
 * The obvious framing is per user — "the earliest createdAt among *my*
 * memberships". But `getCurrentPlan` is handed a companyId and no user, and more
 * importantly a company's plan must not depend on who is asking. If two members
 * resolved different anchors, one could create an invoice the other could not,
 * in the same company, on the same day. So the anchor is a property of the
 * company: it is derived from that company's founding member — its earliest
 * membership, which is the person who created it.
 *
 * The founding member is stable. Someone joining later cannot shorten the
 * window, and cannot extend it either. Today it is also unambiguous: the only
 * place a `CompanyMember` row is created is POST /api/company, which creates the
 * owner alongside the company, so every company has exactly one member. If an
 * invite flow is added later, this stays correct without changing.
 *
 * Deliberately **not** filtered by `user.isActive`. That filter belongs to
 * access control, not to arithmetic about when evaluation began — and using it
 * here would be a bug with teeth: a deactivated founder would resolve to no
 * membership, fall through to the company's own timestamp, and hand the company
 * a brand-new 15-day trial.
 */

/** Earliest of a set of timestamps, ignoring anything unusable. Pure. */
export function earliestCreatedAt(
  rows: ReadonlyArray<{ createdAt: Date | string | null | undefined }>
): Date | null {
  let earliest: Date | null = null;

  for (const row of rows) {
    const value = row?.createdAt;
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date;
  }

  return earliest;
}

/**
 * The trial anchor for one company, or null when there is nothing to anchor to.
 *
 * One query: the company's founding membership, joined through its user to every
 * company that user belongs to. The earliest of those creation dates is the
 * answer — computed here rather than ordered in SQL, because the ordering is
 * across a nested relation and a handful of rows is not worth a second round
 * trip.
 *
 * Falls back to the company's own `createdAt` only when it has no members at
 * all, which POST /api/company cannot produce. That fallback is the pre-existing
 * behaviour, so an orphaned company behaves exactly as it did before.
 */
export async function resolveTrialAnchor(companyId: string): Promise<Date | null> {
  const founding = await prisma.companyMember.findFirst({
    where: { companyId },
    // Oldest membership is the creator; `id` breaks a tie between two rows
    // written in the same transaction, so the answer never depends on row order.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      user: {
        select: {
          companyMembers: {
            select: { company: { select: { createdAt: true } } },
          },
        },
      },
    },
  });

  if (!founding) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { createdAt: true },
    });
    return company?.createdAt ?? null;
  }

  return earliestCreatedAt(founding.user.companyMembers.map((m) => m.company));
}

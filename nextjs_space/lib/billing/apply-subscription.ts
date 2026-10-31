import { shouldApplyEvent, type SubscriptionRecord } from './webhook-mapping';

/**
 * Writes a mapped subscription record, the one way a subscription row changes.
 *
 * Shared by the Polar webhook and the plan-change route. The route applies the
 * subscription Polar returns from the update call, so the plan changes on
 * screen at once; the `subscription.updated` webhook that follows carries the
 * same state and lands on the same row. Both go through this function, so the
 * rules cannot drift apart:
 *
 *   - keyed on Polar's subscription id, so a repeat is an update, never a
 *     second row;
 *   - an event older than what is stored is ignored, so a delayed delivery
 *     cannot roll a plan back;
 *   - the company is never rewritten, so a paid plan cannot move between
 *     companies.
 *
 * Takes the transaction client rather than opening one, so the caller decides
 * the transaction boundary.
 */

export type ApplyOutcome = 'applied' | 'stale' | 'unknown_company';

/** The subset of a Prisma transaction client this needs. Kept narrow for tests. */
export interface SubscriptionWriter {
  company: {
    findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  subscription: {
    findUnique(args: {
      where: { polarSubscriptionId: string };
      select: { id: true; lastEventAt: true };
    }): Promise<{ id: string; lastEventAt: Date | null } | null>;
    upsert(args: {
      where: { polarSubscriptionId: string };
      create: SubscriptionRecord;
      update: Omit<SubscriptionRecord, 'companyId' | 'polarSubscriptionId'>;
    }): Promise<unknown>;
  };
}

export async function applySubscriptionRecord(
  tx: SubscriptionWriter,
  record: SubscriptionRecord
): Promise<ApplyOutcome> {
  const company = await tx.company.findUnique({
    where: { id: record.companyId },
    select: { id: true },
  });
  if (!company) return 'unknown_company';

  const existing = await tx.subscription.findUnique({
    where: { polarSubscriptionId: record.polarSubscriptionId },
    select: { id: true, lastEventAt: true },
  });

  // Out-of-order delivery: an older event must not overwrite newer state.
  if (existing && !shouldApplyEvent(existing.lastEventAt, record.lastEventAt)) return 'stale';

  await tx.subscription.upsert({
    where: { polarSubscriptionId: record.polarSubscriptionId },
    create: record,
    update: {
      // companyId is intentionally not updated: a subscription does not move
      // between companies, and rewriting it would silently transfer a paid plan.
      polarCustomerId: record.polarCustomerId,
      polarProductId: record.polarProductId,
      polarPriceId: record.polarPriceId,
      plan: record.plan,
      status: record.status,
      interval: record.interval,
      currency: record.currency,
      amount: record.amount,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      canceledAt: record.canceledAt,
      trialEndsAt: record.trialEndsAt,
      lastEventAt: record.lastEventAt,
    },
  });
  return 'applied';
}

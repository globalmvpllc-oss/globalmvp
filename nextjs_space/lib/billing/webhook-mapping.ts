import {
  planForConfiguredId,
  planForPolarPriceId,
  isPaidPlan,
  type PaidPlan,
  type BillingInterval,
} from './plans';
import { isSubscriptionStatus, type SubscriptionStatus } from './access';

/**
 * Turning a Polar webhook into a row this application can store.
 *
 * Kept pure — no Prisma, no network, no environment beyond the price map that
 * is passed in — so every branch can be exercised directly. The route does the
 * I/O; this decides what the data means.
 */

/** Subscription lifecycle events this application acts on. */
export const HANDLED_EVENT_TYPES = [
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export function isHandledEventType(type: unknown): type is HandledEventType {
  return typeof type === 'string' && (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Polar's own status strings map onto the ones already defined in access.ts.
 *
 * Kept as an explicit table rather than passing the value straight through: an
 * unrecognised status must be visible, not silently stored and then compared
 * against by the entitlement rule.
 */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  revoked: 'revoked',
  incomplete: 'incomplete',
  incomplete_expired: 'revoked',
  unpaid: 'past_due',
};

export function mapStatus(polarStatus: unknown): SubscriptionStatus | null {
  if (typeof polarStatus !== 'string') return null;
  const mapped = STATUS_MAP[polarStatus];
  return mapped && isSubscriptionStatus(mapped) ? mapped : null;
}

/**
 * The event type itself carries state Polar's `status` field can lag behind.
 *
 * `subscription.revoked` means access is gone even if the payload still reads
 * `active`, so the event wins for those two. Everything else defers to the
 * status field.
 */
export function resolveStatus(
  eventType: string,
  polarStatus: unknown
): SubscriptionStatus | null {
  if (eventType === 'subscription.revoked') return 'revoked';
  if (eventType === 'subscription.past_due') return 'past_due';
  return mapStatus(polarStatus);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // Polar reports money in minor units; the column stores a decimal amount.
  return value / 100;
}

export interface SubscriptionRecord {
  companyId: string;
  polarSubscriptionId: string;
  polarCustomerId: string;
  polarProductId: string;
  polarPriceId: string;
  plan: PaidPlan;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currency: string;
  amount: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  lastEventAt: Date;
}

export type MappingResult =
  | { ok: true; record: SubscriptionRecord }
  | { ok: false; reason: string };

/**
 * Builds the row for a subscription event.
 *
 * Returns a reason instead of throwing when the payload cannot be trusted —
 * an unknown price, a missing company, an unmapped status. The route answers
 * 200 to those so Polar stops retrying an event that will never succeed, and
 * logs the reason rather than writing a half-understood subscription.
 *
 * `companyId` comes from the checkout metadata that this application set when
 * it created the session. It is never taken from anything a browser sent.
 */
export function mapSubscriptionEvent(
  eventType: string,
  data: unknown,
  env: Record<string, string | undefined> = process.env,
  receivedAt: Date = new Date()
): MappingResult {
  if (!isHandledEventType(eventType)) return { ok: false, reason: `unhandled event: ${eventType}` };
  if (!data || typeof data !== 'object') return { ok: false, reason: 'missing event data' };

  const sub = data as Record<string, any>;

  const polarSubscriptionId = typeof sub.id === 'string' ? sub.id : null;
  if (!polarSubscriptionId) return { ok: false, reason: 'missing subscription id' };

  // Set by us in checkouts.create({ metadata }). Its absence means this
  // subscription did not originate from our checkout and cannot be attributed.
  const companyId =
    typeof sub.metadata?.companyId === 'string' ? sub.metadata.companyId : null;
  if (!companyId) return { ok: false, reason: 'missing companyId in metadata' };

  const polarCustomerId =
    typeof sub.customerId === 'string'
      ? sub.customerId
      : typeof sub.customer?.id === 'string'
        ? sub.customer.id
        : null;
  if (!polarCustomerId) return { ok: false, reason: 'missing customer id' };

  const polarProductId =
    typeof sub.productId === 'string'
      ? sub.productId
      : typeof sub.product?.id === 'string'
        ? sub.product.id
        : null;
  if (!polarProductId) return { ok: false, reason: 'missing product id' };

  // Polar may report the price on the subscription or nested on the product.
  const polarPriceId =
    typeof sub.priceId === 'string'
      ? sub.priceId
      : typeof sub.price?.id === 'string'
        ? sub.price.id
        : typeof sub.prices?.[0]?.id === 'string'
          ? sub.prices[0].id
          : null;
  if (!polarPriceId) return { ok: false, reason: 'missing price id' };

  // The plan is derived from what Polar actually charged, never from anything a
  // client claimed. Resolution is layered so it is correct whichever ids the
  // deployment configured:
  //
  //   1. The dedicated PRICE-id variables, matched against the real price id.
  //      This is the precise path, used when POLAR_*_PRICE_ID_* are set.
  //   2. The PRODUCT-id variables (POLAR_*_PRICE_*), matched against the price
  //      id — for deployments (and tests) where those hold price ids.
  //   3. The PRODUCT-id variables matched against the product id — the common
  //      case, since those variables hold product ids in production.
  const selection =
    planForPolarPriceId(polarPriceId, env) ??
    planForConfiguredId(polarPriceId, env) ??
    planForConfiguredId(polarProductId, env);
  if (!selection || !isPaidPlan(selection.plan)) {
    return { ok: false, reason: `unrecognised price: ${polarPriceId} (product ${polarProductId})` };
  }

  const status = resolveStatus(eventType, sub.status);
  if (!status) return { ok: false, reason: `unmapped status: ${String(sub.status)}` };

  const currentPeriodStart = toDate(sub.currentPeriodStart);
  const currentPeriodEnd = toDate(sub.currentPeriodEnd);
  if (!currentPeriodStart || !currentPeriodEnd) {
    return { ok: false, reason: 'missing or invalid billing period' };
  }

  const amount = toAmount(sub.amount);
  if (amount === null) return { ok: false, reason: 'missing or invalid amount' };

  const currency = typeof sub.currency === 'string' ? sub.currency.toUpperCase() : null;
  if (!currency) return { ok: false, reason: 'missing currency' };

  return {
    ok: true,
    record: {
      companyId,
      polarSubscriptionId,
      polarCustomerId,
      polarProductId,
      polarPriceId,
      plan: selection.plan,
      status,
      interval: selection.interval,
      currency,
      amount,
      currentPeriodStart,
      currentPeriodEnd,
      // `uncanceled` explicitly clears a pending cancellation.
      cancelAtPeriodEnd:
        eventType === 'subscription.uncanceled' ? false : Boolean(sub.cancelAtPeriodEnd),
      canceledAt: eventType === 'subscription.uncanceled' ? null : toDate(sub.canceledAt),
      trialEndsAt: toDate(sub.trialEndsAt ?? sub.trialEnd),
      lastEventAt: toDate(sub.modifiedAt) ?? receivedAt,
    },
  };
}

/**
 * Whether an event should be applied to the row already stored.
 *
 * Polar delivers at least once and does not guarantee order, so a redelivered
 * or delayed event can carry a state older than what is already recorded.
 * Applying it would, for instance, let a stale `updated` overwrite a `revoked`
 * and hand back access that was withdrawn.
 */
export function shouldApplyEvent(
  existingLastEventAt: Date | null | undefined,
  incomingEventAt: Date
): boolean {
  if (!existingLastEventAt) return true;
  return incomingEventAt.getTime() >= existingLastEventAt.getTime();
}

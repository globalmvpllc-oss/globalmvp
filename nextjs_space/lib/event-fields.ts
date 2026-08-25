/**
 * Pure field shaping for calendar events — no database access.
 *
 * Kept separate from event-helpers.ts (which imports the Prisma client) so this
 * logic can be unit-tested without a generated client or a live connection,
 * mirroring the payment-math / payment-calc split already used in this codebase.
 */

/**
 * Turns an optional client string into what Prisma should store.
 *
 * An empty string means "clear this field" and becomes null; an absent value
 * means "leave it alone" and becomes undefined, which Prisma skips. Collapsing
 * the two would make it impossible to remove a description once set.
 */
export function optionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Same rule for optional dates. */
export function optionalDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : new Date(value);
}

/** The fields the calendar needs. Keeps responses lean and predictable. */
export const EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  startAt: true,
  endAt: true,
  allDay: true,
  type: true,
  status: true,
  source: true,
  customerId: true,
  invoiceId: true,
  amount: true,
  currency: true,
  reminderAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
} as const;

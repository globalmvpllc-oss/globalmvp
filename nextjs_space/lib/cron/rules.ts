/**
 * Date rules for the daily job — pure, so every edge is unit-tested.
 *
 * Invoice due dates are calendar dates stored as UTC midnight. "Today" for
 * the job is the UTC calendar day it runs on; the cron is scheduled early in
 * the morning UTC (07:00 in Turkey), when that is the same calendar day for
 * Turkey, Europe and the Americas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses the nightly sweep may move to OVERDUE. */
export const OVERDUE_SOURCE_STATUSES = ['SENT', 'VIEWED', 'PARTIALLY_PAID'] as const;

/** UTC midnight of the day `now` falls on. An invoice due before this is late. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whole days between the due date and today (1 = the day after it was due). */
export function daysOverdue(dueDate: Date | string, now: Date): number {
  const due = new Date(dueDate);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.floor((startOfUtcDay(now).getTime() - dueDay) / DAY_MS);
}

/**
 * Whether the sweep should mark an invoice OVERDUE.
 *
 * Only an issued, still-open invoice whose due date has passed and that is
 * not fully paid. The amounts are compared as numbers here; the database
 * query does the same with a column comparison.
 */
export function shouldMarkOverdue(
  invoice: { status: string; dueDate: Date | string; total: unknown; amountPaid: unknown },
  now: Date
): boolean {
  if (!(OVERDUE_SOURCE_STATUSES as readonly string[]).includes(invoice.status)) return false;
  if (daysOverdue(invoice.dueDate, now) < 1) return false;
  return Number(invoice.amountPaid ?? 0) < Number(invoice.total ?? 0);
}

/** The first reminder goes out within this many days of becoming overdue. */
export const OVERDUE_REMINDER_WINDOW_DAYS = 6;
/** The follow-up is "7 days after the due date", with a week's grace for missed runs. */
export const FOLLOW_UP_DAY = 7;
export const FOLLOW_UP_LAST_DAY = 14;

/**
 * Which reminder, if any, an overdue invoice is due today.
 *
 * - 'overdue'  : 1–6 days late and the first reminder not yet sent.
 * - 'followup' : 7–14 days late and the follow-up not yet sent.
 * - null       : anything else. Old overdue invoices are left alone, so
 *                switching the setting on never emails a backlog.
 */
export function reminderDue(
  invoice: {
    status: string;
    dueDate: Date | string;
    total: unknown;
    amountPaid: unknown;
    overdueReminderSentAt?: Date | null;
    followUpReminderSentAt?: Date | null;
  },
  now: Date
): 'overdue' | 'followup' | null {
  if (invoice.status !== 'OVERDUE') return null;
  if (!(Number(invoice.amountPaid ?? 0) < Number(invoice.total ?? 0))) return null;
  const days = daysOverdue(invoice.dueDate, now);
  if (days >= FOLLOW_UP_DAY && days <= FOLLOW_UP_LAST_DAY) {
    return invoice.followUpReminderSentAt ? null : 'followup';
  }
  if (days >= 1 && days <= OVERDUE_REMINDER_WINDOW_DAYS) {
    return invoice.overdueReminderSentAt ? null : 'overdue';
  }
  return null;
}

/**
 * The window of reminder times handled by today's run: from yesterday 00:00
 * UTC (so one missed run is caught up) to tomorrow 00:00 UTC.
 */
export function calendarReminderWindow(now: Date): { gte: Date; lt: Date } {
  const today = startOfUtcDay(now).getTime();
  return { gte: new Date(today - DAY_MS), lt: new Date(today + DAY_MS) };
}

/** Whether an event's reminder is due in today's run. */
export function calendarReminderDue(
  event: { reminderAt?: Date | string | null; reminderSentAt?: Date | null; status?: string | null },
  now: Date
): boolean {
  if (!event.reminderAt || event.reminderSentAt) return false;
  if (event.status === 'CANCELLED' || event.status === 'DONE') return false;
  const at = new Date(event.reminderAt).getTime();
  const { gte, lt } = calendarReminderWindow(now);
  return at >= gte.getTime() && at < lt.getTime();
}

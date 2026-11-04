/**
 * Recurring invoice dates. Pure and unit-tested.
 *
 * Dates are calendar days at UTC midnight. A template remembers the day of the
 * month it started on, so "every month on the 31st" runs 31 Jan, 28 Feb
 * (29 in a leap year), 31 Mar — it does not drift to the 28th for good.
 */
export const FREQUENCY_MONTHS = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as const;
export type RecurringFrequency = keyof typeof FREQUENCY_MONTHS;

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FREQUENCY_MONTHS, value);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** The run after `from`, keeping `dayOfMonth` where the month allows it. */
export function nextRunDate(from: Date, frequency: RecurringFrequency, dayOfMonth: number): Date {
  const months = FREQUENCY_MONTHS[frequency];
  const total = from.getUTCFullYear() * 12 + from.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const day = Math.min(Math.max(1, dayOfMonth), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

/** UTC midnight of today. */
export function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whether a template should produce an invoice in today's run. */
export function isRecurringDue(
  template: { isActive: boolean; nextRunDate: Date | string; endDate?: Date | string | null },
  now: Date
): boolean {
  if (!template.isActive) return false;
  const next = new Date(template.nextRunDate);
  if (next.getTime() > utcToday(now).getTime()) return false;
  if (template.endDate && next.getTime() > new Date(template.endDate).getTime()) return false;
  return true;
}

/**
 * After a run: the new next date, and whether the template stays active (it
 * stops once the next run would fall after its end date).
 */
export function afterRun(
  template: { nextRunDate: Date | string; frequency: string; dayOfMonth: number; endDate?: Date | string | null }
): { nextRunDate: Date; isActive: boolean } {
  const frequency = isRecurringFrequency(template.frequency) ? template.frequency : 'MONTHLY';
  const next = nextRunDate(new Date(template.nextRunDate), frequency, template.dayOfMonth);
  const stillActive = !template.endDate || next.getTime() <= new Date(template.endDate).getTime();
  return { nextRunDate: next, isActive: stillActive };
}

/** Due date of a generated invoice: issue date + payment terms. */
export function dueDateFor(issueDate: Date, paymentTermsDays: number): Date {
  return new Date(issueDate.getTime() + Math.max(0, paymentTermsDays) * 24 * 60 * 60 * 1000);
}

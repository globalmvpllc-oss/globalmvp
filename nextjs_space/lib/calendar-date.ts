/**
 * Calendar dates, as distinct from instants.
 *
 * An invoice due on 31 January is due on that date for everyone. It is a
 * calendar date, not a moment in time — unlike a calendar *event*, which starts
 * at a real instant and legitimately shifts with the reader's timezone.
 *
 * The bug this fixes: forms submit 'YYYY-MM-DD', the API stored it with
 * `new Date('2026-01-31')`, and ECMAScript parses a date-only ISO string as
 * **UTC midnight**. Rendering then used the local calendar — `format()`,
 * `isSameDay()`, `toLocaleDateString()` — so at any negative UTC offset that
 * instant falls on the previous day:
 *
 *     stored              2026-01-31T00:00:00.000Z
 *     Europe/Istanbul     31 January   (correct)
 *     America/New_York    30 January   (off by one)
 *
 * Every US user saw due dates a day early. The storage format is fine and is
 * kept exactly as it is — no migration, no change to what lands in the column.
 * What changes is that reading and writing both go through here, and both work
 * in UTC terms, so the round trip is stable in every timezone.
 *
 * Deliberately NOT used for Event.startAt / Event.endAt: those carry a time of
 * day, are created from local input, and are meant to move with the timezone.
 */

/** Matches a date-only value, with or without a time component. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Normalises a client value to UTC midnight of the calendar day it names.
 *
 * Used on the way in. For a plain 'YYYY-MM-DD' this produces exactly what
 * `new Date(value)` already produced, so stored data is unchanged; the gain is
 * that a full ISO timestamp is also pinned to its UTC calendar day instead of
 * keeping a time that later reads as a different day.
 *
 * Returns null for anything unparseable, so a caller can tell "absent" from
 * "invalid" rather than storing an Invalid Date.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== 'string') return null;

  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The calendar day a stored value names, as a local Date at local midnight.
 *
 * Used on the way out, wherever a stored date meets a local-calendar API such
 * as date-fns `isSameDay` or `format`. Because the returned Date sits at local
 * midnight of the same day number, those comparisons land on the right cell in
 * every timezone.
 */
export function toCalendarDay(value: unknown): Date | null {
  const utc = parseCalendarDate(value);
  if (!utc) return null;
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * The 'YYYY-MM-DD' string a date input expects.
 *
 * Reads UTC components, so seeding an edit form and saving it again cannot walk
 * the date backwards one day per round trip.
 */
export function toCalendarInput(value: unknown): string {
  const utc = parseCalendarDate(value);
  if (!utc) return '';
  return utc.toISOString().slice(0, 10);
}

/** Today's calendar day as 'YYYY-MM-DD', for seeding new records. */
export function todayCalendarInput(now: Date = new Date()): string {
  // Local components: "today" means the user's today, not UTC's.
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds whole days to a calendar-date input string, staying on calendar days.
 *
 * Used for due dates derived from payment terms. Working in UTC avoids the
 * daylight-saving edge where adding 30 days across a transition lands an hour
 * short and rolls back a day.
 */
export function addCalendarDays(value: string, days: number): string {
  const utc = parseCalendarDate(value);
  if (!utc) return '';
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Formats a calendar date for display, in UTC terms.
 *
 * `toLocaleDateString` on a stored UTC-midnight value renders the previous day
 * at negative offsets, which is the display half of the same bug. This is used
 * by the invoice document, where the date must read identically no matter where
 * the PDF is generated.
 */
export function formatCalendarDateLong(value: unknown): string {
  const utc = parseCalendarDate(value);
  if (!utc) return '';
  return `${MONTHS[utc.getUTCMonth()]} ${utc.getUTCDate()}, ${utc.getUTCFullYear()}`;
}

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

/**
 * Formats a calendar date for the application UI, in UTC terms.
 *
 * Mirrors the two date-fns patterns this codebase already used —
 * 'MMM d, yyyy' and 'MMM d' — without going through the local calendar, which
 * is what shifted the day at negative offsets.
 */
export function formatCalendarDate(value: unknown, style: 'MMM d, yyyy' | 'MMM d' = 'MMM d, yyyy'): string {
  const utc = parseCalendarDate(value);
  if (!utc) return '';
  const label = `${SHORT_MONTHS[utc.getUTCMonth()]} ${utc.getUTCDate()}`;
  return style === 'MMM d' ? label : `${label}, ${utc.getUTCFullYear()}`;
}

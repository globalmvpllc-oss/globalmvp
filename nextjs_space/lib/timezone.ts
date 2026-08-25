/**
 * Month boundaries in a company's own time zone.
 *
 * Vercel functions run in UTC, so `new Date(y, m, 1)` produced a UTC month
 * boundary. For a company in Europe/Istanbul (UTC+3) that shifts the window by
 * three hours: entries recorded during the first three hours of a month landed
 * in the previous month's totals, and the last three hours of a month were
 * missing from it.
 *
 * Company.timezone already exists on the model and was never read. This reads it.
 */

const DEFAULT_TIMEZONE = 'UTC';

/**
 * The wall-clock date parts in a given IANA time zone for a point in time.
 * Uses Intl rather than a date library so no dependency is added.
 */
function getZonedParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** The offset, in minutes, of a time zone at a given instant. */
function getOffsetMinutes(instant: Date, timeZone: string): number {
  // Format the instant as if it were UTC wall-clock in the target zone, then
  // measure how far that drifts from the real instant.
  const asUtc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asZoned = new Date(instant.toLocaleString('en-US', { timeZone }));
  return (asZoned.getTime() - asUtc.getTime()) / 60000;
}

/** Validates a time zone, falling back to UTC rather than throwing. */
export function safeTimeZone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * The UTC instants bounding the current month as experienced in `timeZone`.
 * The interval is half-open: [startOfMonth, startOfNextMonth).
 */
export function getMonthRange(
  timeZone?: string | null,
  now: Date = new Date()
): { startOfMonth: Date; startOfNextMonth: Date } {
  const zone = safeTimeZone(timeZone);
  const { year, month } = getZonedParts(now, zone);

  const buildBoundary = (y: number, m: number): Date => {
    // Midnight on the first of the month, as a UTC instant, then corrected by
    // the zone's offset so it represents local midnight.
    const utcGuess = Date.UTC(y, m - 1, 1, 0, 0, 0, 0);
    const offset = getOffsetMinutes(new Date(utcGuess), zone);
    return new Date(utcGuess - offset * 60000);
  };

  const startOfMonth = buildBoundary(year, month);
  const startOfNextMonth = month === 12 ? buildBoundary(year + 1, 1) : buildBoundary(year, month + 1);

  return { startOfMonth, startOfNextMonth };
}

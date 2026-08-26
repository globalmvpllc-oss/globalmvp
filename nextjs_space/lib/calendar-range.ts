import { parseCalendarDate } from '@/lib/calendar-date';

/**
 * Optional `from` / `to` filtering for the list endpoints.
 *
 * The calendar needs the financial records that fall inside the month it is
 * showing. It used to ask for the whole list and filter in the browser, which
 * quietly lost data: `/api/invoices` and `/api/payments` return the 100 most
 * recent rows by default, so a business with more than that simply never saw
 * the older due dates — with nothing on screen to say so.
 *
 * ## Boundaries
 *
 * Half-open: `from` inclusive, `to` exclusive. A caller asking for August sends
 * `from=2026-08-01&to=2026-09-01`, so the 31st is included and the 1st of
 * September belongs to the next request. Adjacent months therefore neither
 * overlap nor leave a gap.
 *
 * ## Timezone
 *
 * Both bounds go through `parseCalendarDate`, which pins a 'YYYY-MM-DD' value
 * to UTC midnight — exactly how these columns were written. The comparison is
 * therefore against the same instants the rows hold, with no local-offset
 * conversion anywhere in between, so a caller in Los Angeles and one in
 * Istanbul asking for "August" get the same rows. DST cannot shift a boundary
 * because no local arithmetic is involved.
 *
 * Deliberately *not* applied to `Event.startAt`: those are real instants with a
 * time of day and the events route already has its own window.
 */

export interface CalendarRange {
  gte?: Date;
  lt?: Date;
}

export interface RangeParseResult {
  /** Prisma date filter, or null when neither bound was supplied. */
  range: CalendarRange | null;
  /** Set when a bound was supplied but unusable. */
  error: string | null;
}

/**
 * Reads `from` / `to` from a query string.
 *
 * A malformed bound is an error rather than being silently dropped: ignoring it
 * would return the unfiltered list and reintroduce the truncation this exists
 * to prevent.
 */
export function parseCalendarRange(searchParams: URLSearchParams): RangeParseResult {
  const rawFrom = searchParams.get('from');
  const rawTo = searchParams.get('to');

  if (rawFrom === null && rawTo === null) {
    return { range: null, error: null };
  }

  const range: CalendarRange = {};

  if (rawFrom !== null) {
    const from = parseCalendarDate(rawFrom);
    if (!from) return { range: null, error: "'from' must be a date such as 2026-08-01" };
    range.gte = from;
  }

  if (rawTo !== null) {
    const to = parseCalendarDate(rawTo);
    if (!to) return { range: null, error: "'to' must be a date such as 2026-09-01" };
    range.lt = to;
  }

  if (range.gte && range.lt && range.lt <= range.gte) {
    return { range: null, error: "'to' must be after 'from'" };
  }

  return { range, error: null };
}

/**
 * Ceiling for a range-scoped query.
 *
 * A month of records sits far below this for any realistic small business; the
 * cap exists so a caller asking for a decade cannot pull an unbounded result
 * set. Chosen well above the default page size so a normal month is always
 * returned complete — the point of this feature is that nothing is dropped
 * without the caller knowing.
 */
export const RANGE_MAX = 2000;

/**
 * Default ceiling for a list that was previously unbounded.
 *
 * Generous on purpose: a small business is very unlikely to reach it, and the
 * pages that read these lists compute their summary totals in the browser from
 * every row they receive. Silently returning the first 100 would leave those
 * totals quietly wrong — worse than a slow response. So the cap is high enough
 * to be practically invisible, and when it *is* reached the caller is told.
 */
export const DEFAULT_LIST_TAKE = 1000;

/** Hard ceiling a caller may request. */
export const MAX_LIST_TAKE = 2000;

/** Reads an optional `take`, clamped to sane bounds. */
export function boundedTake(searchParams: URLSearchParams): number {
  const value = searchParams.get('take');

  // `?take=` yields '' rather than null, and Number('') is 0 — which is finite,
  // so it would slip past a NaN check and clamp to 1, returning a single row.
  // An absent or blank parameter means "use the default", not "return almost
  // nothing".
  if (value === null || value.trim() === '') return DEFAULT_LIST_TAKE;

  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_LIST_TAKE;

  return Math.min(Math.max(Math.trunc(raw), 1), MAX_LIST_TAKE);
}

/**
 * Returns a bounded list and says whether anything was left out.
 *
 * Callers fetch `take + 1` rows; the extra row is the truncation signal and is
 * trimmed before serialising. The body stays a plain array, so every existing
 * consumer keeps working unchanged, and the signal rides on headers:
 *
 *   X-Returned-Count  rows in this response
 *   X-Has-More        "true" when at least one row was withheld
 *
 * The point is that truncation is never silent. A page showing totals derived
 * from these rows can surface a warning instead of quietly under-reporting.
 */
export function listResponse<T>(rows: T[], take: number): Response {
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return new Response(JSON.stringify(page), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Returned-Count': String(page.length),
      'X-Has-More': hasMore ? 'true' : 'false',
    },
  });
}

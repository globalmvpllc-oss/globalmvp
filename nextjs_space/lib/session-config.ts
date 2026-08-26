/**
 * Session lifetime, kept separate from lib/auth.ts.
 *
 * lib/auth.ts instantiates the Prisma client at module load, so importing it
 * pulls a generated client into anything that touches it — including tests.
 * The policy itself is a plain value with no dependencies, so it lives here and
 * can be asserted directly, matching how payment-math and calendar-date keep
 * pure logic away from the database layer.
 */

/** Seconds in a day, spelled out so the values below read as durations. */
const DAY = 24 * 60 * 60;

/**
 * How long a session stays valid without activity.
 *
 * Seven days rather than NextAuth's 30-day default. This is bookkeeping data —
 * customer contact details, invoice history, bank-adjacent records — so a
 * month-long window on a shared or lost device is longer than the convenience
 * justifies.
 */
export const SESSION_MAX_AGE = 7 * DAY;

/**
 * How often an active session's expiry is pushed forward.
 *
 * Daily sliding renewal means someone using the product is never signed out on
 * a fixed schedule; only genuine inactivity ends the session.
 */
export const SESSION_UPDATE_AGE = 1 * DAY;

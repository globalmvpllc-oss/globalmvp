/**
 * Rate limiting for the unauthenticated endpoints.
 *
 * Signup and login are the only routes reachable without a session, so they are
 * the only ones an anonymous caller can hammer — for password guessing, for
 * account enumeration, or simply to create thousands of accounts.
 *
 * ## Why in-process, and what that does and does not buy
 *
 * This is a fixed-window counter held in module memory. On Vercel each warm
 * lambda keeps its own map, so a caller spread across N instances effectively
 * gets N windows, and a cold start resets the count. It is therefore a real
 * brake on a single attacker hitting one region hard, and *not* a guarantee.
 *
 * That trade is deliberate: the alternative is a shared store (Redis/Upstash),
 * which is the right answer at scale but adds a network dependency and a new
 * service to the deployment. Adding a dependency was out of scope here, so this
 * keeps the door from standing wide open today, and `checkRateLimit` is written
 * so a shared backend can replace the map without touching either call site.
 *
 * Note the login limiter sits behind bcrypt at cost 12: each attempt already
 * costs ~200ms of CPU, so unthrottled guessing was slow to begin with. This
 * bounds it rather than being the only thing standing in the way.
 */

export interface RateLimitRule {
  /** Attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window; 0 once blocked. */
  remaining: number;
  /** Seconds until the window resets — used for the Retry-After header. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  /** Epoch ms at which this window ends. */
  resetAt: number;
}

/** Signup is a human action taken once; a handful per hour is generous. */
export const SIGNUP_RULE: RateLimitRule = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * Login allows for genuine mistyping — a person recovering a password will make
 * several attempts in a row — while still cutting off automated guessing.
 */
export const LOGIN_RULE: RateLimitRule = { limit: 10, windowMs: 15 * 60 * 1000 };

/** Requesting a reset link is a human action; a handful per hour is plenty. */
export const FORGOT_PASSWORD_RULE: RateLimitRule = { limit: 5, windowMs: 60 * 60 * 1000 };

/** Spending a reset link tolerates a few retries while still bounding guessing. */
export const RESET_PASSWORD_RULE: RateLimitRule = { limit: 10, windowMs: 15 * 60 * 1000 };

/** Re-sending a verification email, bounded like the reset request. */
export const RESEND_VERIFICATION_RULE: RateLimitRule = { limit: 5, windowMs: 60 * 60 * 1000 };

const buckets = new Map<string, Bucket>();

/**
 * Bound on retained keys. Without this the map grows for every distinct IP seen
 * by a long-lived instance, which is a slow memory leak on a busy deployment.
 */
const MAX_TRACKED_KEYS = 10_000;

/** Drops windows that have already expired, and hard-caps the map. */
function evictExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_TRACKED_KEYS) {
    // Oldest-first: Map preserves insertion order.
    const excess = buckets.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/**
 * Records an attempt and reports whether it is allowed.
 *
 * Counts the attempt whether or not it succeeds: only counting failures would
 * let a caller alternate a valid request in to keep their window clear.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): RateLimitResult {
  evictExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds };
}

/**
 * Best-effort client address.
 *
 * Vercel sets x-forwarded-for and strips inbound copies, so the first entry is
 * the real client there. Behind a proxy that does not, this is spoofable — a
 * reason to treat the limiter as a brake rather than a guarantee. Requests with
 * no usable address share one bucket rather than bypassing the limit.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || real?.trim() || 'unknown';
  return `${scope}:${ip}`;
}

/** Test seam — resets state between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}

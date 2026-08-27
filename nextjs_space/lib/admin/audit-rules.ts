/**
 * What may be written to the audit trail.
 *
 * Pure, so the redaction can be tested directly rather than trusted. Everything
 * bound for `AuditLog.metadata` passes through `redactMetadata` first.
 *
 * The rule is deny-first on the key name: a field whose name suggests a secret
 * is replaced, whatever it holds. Matching on the value instead would mean
 * guessing what a token looks like, and the guess would eventually be wrong.
 */

/** Field names never stored, matched case-insensitively as substrings. */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'hashedpassword',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'credential',
  'privatekey',
  'private_key',
  'card',
  'cvv',
  'iban',
  'ssn',
  'otp',
  'totp',
  'signature',
  // Connection strings carry credentials in the URL itself.
  'databaseurl',
  'connectionstring',
  'dsn',
] as const;

export const REDACTED = '[redacted]';

export function isSensitiveKey(key: string): boolean {
  // Separators are dropped from both sides, so api_key, apiKey, API-KEY and
  // api.key all reduce to the same thing and match the same pattern.
  const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalised.includes(pattern.replace(/[^a-z]/g, ''))
  );
}

/** Caps how much text any single value may contribute. */
const MAX_STRING = 500;
const MAX_DEPTH = 4;
const MAX_KEYS = 50;

/**
 * Strips secrets and trims bulk from a metadata object.
 *
 * Recurses so a secret nested inside an object is caught too, with a depth cap
 * because an audit entry is context, not a copy of the request.
 */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((entry) => redactMetadata(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    let count = 0;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_KEYS) break;
      count++;
      output[key] = isSensitiveKey(key) ? REDACTED : redactMetadata(entry, depth + 1);
    }
    return output;
  }

  // Functions, symbols and anything else are not context worth keeping.
  return REDACTED;
}

/** Trims request headers to something worth storing. */
export function truncateHeader(value: string | null | undefined, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * The client address, taken from the first forwarded entry.
 *
 * Vercel sets this header itself and strips any inbound copy, so the first
 * entry is the caller. Behind a different proxy this would need revisiting.
 */
export function clientIp(forwardedFor: string | null | undefined): string | null {
  if (typeof forwardedFor !== 'string') return null;
  const first = forwardedFor.split(',')[0]?.trim();
  return first ? truncateHeader(first, 60) : null;
}

/** Actions the panel records. Kept as a union so a typo is a compile error. */
export const AUDIT_ACTIONS = [
  'admin.login',
  'admin.dashboard.viewed',
  'admin.users.listed',
  'admin.user.viewed',
  'admin.companies.listed',
  'admin.company.viewed',
  'admin.invoices.listed',
  'admin.payments.listed',
  'admin.subscriptions.listed',
  'admin.events.listed',
  'admin.audit.listed',
  'admin.security.viewed',
  'admin.settings.viewed',
  'admin.access.denied',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

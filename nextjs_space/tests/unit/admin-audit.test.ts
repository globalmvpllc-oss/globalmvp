import { describe, it, expect } from 'vitest';
import {
  redactMetadata,
  isSensitiveKey,
  truncateHeader,
  clientIp,
  isAuditAction,
  AUDIT_ACTIONS,
  REDACTED,
} from '@/lib/admin/audit-rules';

/**
 * What the audit trail is allowed to keep.
 *
 * A log that captures a password is worse than no log: it turns a review tool
 * into a second copy of the thing it was meant to protect. The redaction is
 * therefore pinned from both directions — what must be stripped, and what must
 * survive so the entry is still useful.
 */

describe('sensitive field names', () => {
  it.each([
    'password',
    'Password',
    'hashedPassword',
    'user_password',
    'accessToken',
    'POLAR_ACCESS_TOKEN',
    'webhookSecret',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'sessionToken',
    'privateKey',
    'cardNumber',
    'cvv',
    'iban',
    'totpSecret',
    'signature',
  ])('treats %s as sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['email', 'name', 'companyId', 'action', 'createdAt', 'plan', 'status', 'country'])(
    'leaves %s alone',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    }
  );
});

describe('redaction', () => {
  it('replaces a secret while keeping the surrounding context', () => {
    const result = redactMetadata({
      email: 'someone@example.com',
      password: 'hunter2',
      plan: 'pro',
    }) as Record<string, unknown>;

    expect(result.email).toBe('someone@example.com');
    expect(result.plan).toBe('pro');
    expect(result.password).toBe(REDACTED);
  });

  it('catches a secret nested inside an object', () => {
    const result = redactMetadata({
      request: { headers: { authorization: 'Bearer abc123' }, path: '/admin/users' },
    }) as any;

    expect(result.request.headers.authorization).toBe(REDACTED);
    expect(result.request.path).toBe('/admin/users');
  });

  it('catches a secret inside an array', () => {
    const result = redactMetadata({ items: [{ token: 'abc' }, { name: 'ok' }] }) as any;
    expect(result.items[0].token).toBe(REDACTED);
    expect(result.items[1].name).toBe('ok');
  });

  it('never lets a known secret value through under a sensitive key', () => {
    const serialised = JSON.stringify(
      redactMetadata({ POLAR_WEBHOOK_SECRET: 'whsec_realvalue', hashedPassword: '$2a$12$abc' })
    );
    expect(serialised).not.toContain('whsec_realvalue');
    expect(serialised).not.toContain('$2a$12$abc');
  });

  it('truncates a very long string rather than storing it whole', () => {
    const result = redactMetadata({ note: 'x'.repeat(5000) }) as any;
    expect(result.note.length).toBeLessThan(600);
  });

  it('stops recursing at a sane depth', () => {
    let deep: any = 'bottom';
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    // An audit entry is context, not a copy of the request.
    expect(JSON.stringify(redactMetadata(deep))).toContain(REDACTED);
  });

  it('caps how many keys one entry may carry', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 500; i++) wide[`k${i}`] = i;
    expect(Object.keys(redactMetadata(wide) as object).length).toBeLessThanOrEqual(50);
  });

  it.each([null, undefined])('turns %s into null', (value) => {
    expect(redactMetadata(value)).toBeNull();
  });

  it('keeps primitives usable', () => {
    expect(redactMetadata(42)).toBe(42);
    expect(redactMetadata(true)).toBe(true);
    expect(redactMetadata('plain')).toBe('plain');
  });

  it('serialises a date rather than dropping it', () => {
    expect(redactMetadata(new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-06-15T12:00:00.000Z');
  });

  it('does not keep functions', () => {
    const result = redactMetadata({ fn: () => 'x', name: 'kept' }) as any;
    expect(result.fn).toBe(REDACTED);
    expect(result.name).toBe('kept');
  });
});

describe('request headers', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp('203.0.113.7, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.7');
  });

  it('handles a single address', () => {
    expect(clientIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it.each([null, undefined, '', '   '])('returns null for %s', (value) => {
    expect(clientIp(value)).toBeNull();
  });

  it('truncates an overlong user agent', () => {
    expect(truncateHeader('a'.repeat(2000))!.length).toBe(300);
  });

  it.each([null, undefined, '', '  '])('returns null for header %s', (value) => {
    expect(truncateHeader(value)).toBeNull();
  });
});

describe('action vocabulary', () => {
  it.each(AUDIT_ACTIONS)('accepts %s', (action) => {
    expect(isAuditAction(action)).toBe(true);
  });

  it.each(['whatever', '', null, 42, 'admin.'])('rejects %s', (value) => {
    expect(isAuditAction(value)).toBe(false);
  });

  it('records reads as well as writes', () => {
    // Who looked at whose data is the question an audit trail usually has to
    // answer, so listing and viewing are recorded, not just changes.
    expect(AUDIT_ACTIONS).toContain('admin.users.listed');
    expect(AUDIT_ACTIONS).toContain('admin.company.viewed');
  });
});

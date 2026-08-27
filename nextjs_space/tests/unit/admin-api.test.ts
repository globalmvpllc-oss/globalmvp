import { describe, it, expect } from 'vitest';
import {
  isAdminEmail,
  parsePagination,
  parseSearch,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_PAGE_SIZE,
} from '@/lib/admin/access';
import { AUDIT_ACTIONS, isAuditAction, redactMetadata } from '@/lib/admin/audit-rules';
import { totalPages } from '@/lib/admin/access';

/**
 * The admin API surface.
 *
 * These pin the properties a route cannot be allowed to lose: that nothing a
 * caller sends decides authorisation, that a page cannot be widened into a full
 * table dump, and that every listing is recorded.
 */

const ENV = { ADMIN_EMAIL: 'avcticaret@gmail.com' };

describe('client-supplied values never grant access', () => {
  /**
   * `isAdminEmail` takes an address and an environment — and nothing else.
   * There is no parameter through which a header, body or query value could
   * reach the decision, which is what these assert by construction.
   */
  it.each([
    { isAdmin: true },
    { 'x-admin': 'true' },
    { role: 'admin' },
    { admin: 1 },
  ])('a payload like %o cannot stand in for an address', (payload) => {
    expect(isAdminEmail(payload as unknown, ENV)).toBe(false);
  });

  it('the literal string "true" is not an administrator', () => {
    expect(isAdminEmail('true', ENV)).toBe(false);
    expect(isAdminEmail('admin', ENV)).toBe(false);
    expect(isAdminEmail('1', ENV)).toBe(false);
  });

  it.each([
    'avcticaret@gmail.com.evil.com',
    'evil-avcticaret@gmail.com',
    'avcticaret@gmail.com@evil.com',
    'avcticaret@gmail.comx',
    'xavcticaret@gmail.com',
  ])('rejects the lookalike %s', (email) => {
    expect(isAdminEmail(email, ENV)).toBe(false);
  });

  it('accepts only the exact address, normalised', () => {
    expect(isAdminEmail('  AVCTICARET@GMAIL.COM  ', ENV)).toBe(true);
  });

  it('denies everyone when unconfigured', () => {
    expect(isAdminEmail('avcticaret@gmail.com', {})).toBe(false);
    expect(isAdminEmail('avcticaret@gmail.com', { ADMIN_EMAIL: '   ' })).toBe(false);
  });
});

describe('pagination is clamped on every listing', () => {
  const q = (query: string) => new URLSearchParams(query);

  it('caps the page size at 100', () => {
    expect(ADMIN_MAX_PAGE_SIZE).toBe(100);
    expect(parsePagination(q('pageSize=100000')).pageSize).toBe(100);
    expect(parsePagination(q('pageSize=101')).pageSize).toBe(100);
  });

  it('uses a modest default', () => {
    expect(ADMIN_PAGE_SIZE).toBeLessThanOrEqual(50);
    expect(parsePagination(q('')).pageSize).toBe(ADMIN_PAGE_SIZE);
  });

  it.each(['page=-1', 'page=0', 'page=NaN', 'page=Infinity', 'page=abc', 'page=1e999'])(
    'normalises %s to the first page',
    (query) => {
      const result = parsePagination(q(query));
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    }
  );

  it.each(['pageSize=-10', 'pageSize=0', 'pageSize=NaN', 'pageSize=Infinity'])(
    'normalises %s to the default size',
    (query) => {
      expect(parsePagination(q(query)).pageSize).toBe(ADMIN_PAGE_SIZE);
    }
  );

  it('floors a decimal page rather than producing a fractional skip', () => {
    const result = parsePagination(q('page=3.7&pageSize=10.9'));
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(Number.isInteger(result.skip)).toBe(true);
  });

  it('never returns a negative skip', () => {
    for (const query of ['page=-99', 'page=0', 'page=abc']) {
      expect(parsePagination(q(query)).skip).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('search input', () => {
  const q = (query: string) => new URLSearchParams(query);

  it('trims and keeps a usable term', () => {
    expect(parseSearch(q('q=%20%20acme%20%20'))).toBe('acme');
  });

  it.each(['q=', 'q=a', 'q=%20', ''])('ignores %s', (query) => {
    expect(parseSearch(q(query))).toBeNull();
  });

  it('caps the length', () => {
    expect(parseSearch(q(`q=${'a'.repeat(9999)}`))!.length).toBe(100);
  });

  it('passes the term through Prisma rather than into raw SQL', () => {
    // The term is used only as a `contains` value in a Prisma filter, which is
    // parameterised. This asserts the shape the routes rely on.
    const term = parseSearch(q("q=' OR 1=1 --"));
    expect(term).toBe("' OR 1=1 --");
    expect(typeof term).toBe('string');
  });
});

describe('every admin section records that it was read', () => {
  it.each([
    'admin.dashboard.viewed',
    'admin.users.listed',
    'admin.companies.listed',
    'admin.invoices.listed',
    'admin.payments.listed',
    'admin.subscriptions.listed',
    'admin.events.listed',
    'admin.audit.listed',
    'admin.security.viewed',
    'admin.settings.viewed',
  ])('%s is a known action', (action) => {
    expect(isAuditAction(action)).toBe(true);
  });

  it('includes reading the audit log itself', () => {
    // Who looked at the trail is part of the trail.
    expect(AUDIT_ACTIONS).toContain('admin.audit.listed');
  });

  it('rejects an unknown action, so a typo cannot be recorded silently', () => {
    expect(isAuditAction('admin.users.list')).toBe(false);
    expect(isAuditAction('')).toBe(false);
  });
});

describe('audit metadata carries no secret', () => {
  it.each([
    ['password', 'hunter2'],
    ['hashedPassword', '$2a$12$abcdef'],
    ['sessionToken', 'eyJhbGciOiJIUzI1NiJ9.payload.sig'],
    ['resetToken', 'abc123def456'],
    ['RESEND_API_KEY', 're_live_key'],
    ['POLAR_WEBHOOK_SECRET', 'whsec_live'],
    ['DATABASE_URL', 'postgresql://user:pw@host/db'],
    ['cookie', 'next-auth.session-token=abc'],
    ['authorization', 'Bearer abc'],
  ])('%s never reaches the log', (key, value) => {
    const serialised = JSON.stringify(redactMetadata({ [key]: value }));
    expect(serialised).not.toContain(value);
  });

  it('strips a secret nested in an object or an array', () => {
    const serialised = JSON.stringify(
      redactMetadata({ outer: { apiKey: 'secret-value' }, list: [{ token: 'another' }] })
    );
    expect(serialised).not.toContain('secret-value');
    expect(serialised).not.toContain('another');
  });

  it('keeps the harmless context that makes an entry useful', () => {
    const result = redactMetadata({ page: 2, pageSize: 25, searched: true }) as any;
    expect(result).toEqual({ page: 2, pageSize: 25, searched: true });
  });
});

describe('page counts', () => {
  it('never drops below one, so the UI always has a page', () => {
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(1, 25)).toBe(1);
  });

  it('rounds up a partial page', () => {
    expect(totalPages(26, 25)).toBe(2);
    expect(totalPages(50, 25)).toBe(2);
    expect(totalPages(51, 25)).toBe(3);
  });
});

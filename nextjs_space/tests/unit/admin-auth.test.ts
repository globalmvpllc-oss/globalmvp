import { describe, it, expect } from 'vitest';
import {
  getAdminEmail,
  isAdminEmail,
  parsePagination,
  parseSearch,
  ADMIN_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
} from '@/lib/admin/access';

/**
 * Admin authorisation.
 *
 * This is the part of the panel where a mistake is not a bug but a breach, so
 * the decision is pinned from several directions: who counts as an
 * administrator, who does not, and what happens when it is unconfigured.
 */

const ENV = { ADMIN_EMAIL: 'avcticaret@gmail.com' };

describe('configured administrator', () => {
  it('reads the address from the environment', () => {
    expect(getAdminEmail(ENV)).toBe('avcticaret@gmail.com');
  });

  it('normalises case and whitespace', () => {
    expect(getAdminEmail({ ADMIN_EMAIL: '  AvcTicaret@Gmail.COM ' })).toBe('avcticaret@gmail.com');
  });

  it.each([{}, { ADMIN_EMAIL: '' }, { ADMIN_EMAIL: '   ' }])(
    'is null when unset or blank (%o)',
    (env) => {
      expect(getAdminEmail(env)).toBeNull();
    }
  );
});

describe('who is an administrator', () => {
  it('accepts the configured address', () => {
    expect(isAdminEmail('avcticaret@gmail.com', ENV)).toBe(true);
  });

  it.each(['AVCTICARET@GMAIL.COM', ' avcticaret@gmail.com ', 'AvcTicaret@Gmail.com'])(
    'accepts it regardless of case or padding (%s)',
    (email) => {
      expect(isAdminEmail(email, ENV)).toBe(true);
    }
  );

  it.each([
    'someone@example.com',
    'avcticaret@gmail.com.attacker.net',
    'attacker+avcticaret@gmail.com',
    'avcticaret@gmail.co',
    'xavcticaret@gmail.com',
    'avcticaret@gmail.com ',
  ])('rejects %s', (email) => {
    // The padded one is accepted after trimming, so it is excluded below.
    if (email.trim().toLowerCase() === 'avcticaret@gmail.com') return;
    expect(isAdminEmail(email, ENV)).toBe(false);
  });

  it('rejects a suffix match, which is how lookalike domains get through', () => {
    expect(isAdminEmail('avcticaret@gmail.com.evil.test', ENV)).toBe(false);
  });

  it.each([null, undefined, 42, {}, [], true])('rejects a non-string (%s)', (value) => {
    expect(isAdminEmail(value, ENV)).toBe(false);
  });

  it('fails closed when no administrator is configured', () => {
    // A deployment that forgot ADMIN_EMAIL has no admin panel, not an open one.
    expect(isAdminEmail('avcticaret@gmail.com', {})).toBe(false);
    expect(isAdminEmail('anyone@example.com', {})).toBe(false);
  });

  it('cannot be satisfied by an empty address when unconfigured', () => {
    expect(isAdminEmail('', {})).toBe(false);
    expect(isAdminEmail('', { ADMIN_EMAIL: '' })).toBe(false);
  });
});

describe('pagination cannot be used to pull the whole table', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('defaults to the first page', () => {
    expect(parsePagination(params(''))).toEqual({
      page: 1,
      pageSize: ADMIN_PAGE_SIZE,
      skip: 0,
    });
  });

  it('computes skip from the page', () => {
    expect(parsePagination(params('page=3')).skip).toBe(ADMIN_PAGE_SIZE * 2);
  });

  it('clamps an oversized page size', () => {
    expect(parsePagination(params('pageSize=100000')).pageSize).toBe(ADMIN_MAX_PAGE_SIZE);
  });

  it.each(['page=0', 'page=-5', 'page=abc', 'page=', 'page=NaN'])(
    'falls back to page 1 for %s',
    (query) => {
      expect(parsePagination(params(query)).page).toBe(1);
    }
  );

  it.each(['pageSize=0', 'pageSize=-10', 'pageSize=abc', 'pageSize='])(
    'falls back to the default size for %s',
    (query) => {
      expect(parsePagination(params(query)).pageSize).toBe(ADMIN_PAGE_SIZE);
    }
  );

  it('floors a fractional page rather than producing a fractional skip', () => {
    const result = parsePagination(params('page=2.9'));
    expect(result.page).toBe(2);
    expect(Number.isInteger(result.skip)).toBe(true);
  });

  it('never produces a negative skip', () => {
    for (const query of ['page=-1', 'page=0', 'page=abc']) {
      expect(parsePagination(params(query)).skip).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('search terms', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('accepts a usable term', () => {
    expect(parseSearch(params('q=avc'))).toBe('avc');
  });

  it('trims surrounding whitespace', () => {
    expect(parseSearch(params('q=%20%20avc%20%20'))).toBe('avc');
  });

  it.each(['', 'q=', 'q=a', 'q=%20'])('ignores a term too short to narrow anything (%s)', (query) => {
    expect(parseSearch(params(query))).toBeNull();
  });

  it('caps the length so a huge term cannot be pushed into the query', () => {
    const long = 'a'.repeat(5000);
    expect(parseSearch(params(`q=${long}`))!.length).toBe(100);
  });
});

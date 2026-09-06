import { describe, it, expect } from 'vitest';
import {
  resolveActiveCompanyId,
  isRequestHonoured,
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_MAX_AGE,
  type MembershipRef,
} from '@/lib/active-company';

/**
 * Active company selection.
 *
 * This is the tenant boundary. `requireUserCompany` resolves through it, and
 * thirty API routes scope every invoice, payment, customer and bank transaction
 * by the companyId it returns. A wrong answer here is one company's data served
 * under another company's account, so these are security tests, not unit tests
 * for a preference.
 *
 * The rule the whole thing rests on: the cookie is a request. Only a company
 * that appears in the membership list — which the caller loaded from the
 * database for this signed-in, active user — can ever be returned.
 */

const memberships = (...ids: string[]): MembershipRef[] => ids.map((companyId) => ({ companyId }));

const ACME = 'cmp_acme';
const BETA = 'cmp_beta';
/** A company the user in these tests never belongs to. */
const SOMEONE_ELSES = 'cmp_not_mine';

describe('cookie names a company the user belongs to', () => {
  it('returns that company', () => {
    expect(resolveActiveCompanyId(memberships(ACME, BETA), BETA)).toBe(BETA);
  });

  it('returns it even when it is not the first membership', () => {
    expect(resolveActiveCompanyId(memberships(ACME, BETA, 'cmp_c'), 'cmp_c')).toBe('cmp_c');
  });

  it('tolerates surrounding whitespace in the stored value', () => {
    expect(resolveActiveCompanyId(memberships(ACME, BETA), `  ${BETA}  `)).toBe(BETA);
  });
});

describe('cross-tenant: cookie names a company the user does NOT belong to', () => {
  /**
   * The case this whole module exists to prevent. If any of these ever returns
   * the requested id, a user has scoped their session to a company they have no
   * membership for, and every route behind `requireUserCompany` follows them
   * into it.
   */
  it('never returns the requested company', () => {
    expect(resolveActiveCompanyId(memberships(ACME), SOMEONE_ELSES)).not.toBe(SOMEONE_ELSES);
    expect(resolveActiveCompanyId(memberships(ACME, BETA), SOMEONE_ELSES)).not.toBe(SOMEONE_ELSES);
  });

  it('falls back to a company the user really does belong to', () => {
    expect(resolveActiveCompanyId(memberships(ACME, BETA), SOMEONE_ELSES)).toBe(ACME);
  });

  it('does not lock the user out by returning null', () => {
    // Falling back to "no company" would answer 403 on every route and strand a
    // user who has a perfectly good membership, just because of a stale cookie.
    expect(resolveActiveCompanyId(memberships(ACME), SOMEONE_ELSES)).not.toBeNull();
  });

  it('rejects a revoked membership once it leaves the list', () => {
    // The user had BETA selected; the membership was then revoked, so the next
    // request loads a list without it. The selection must stop being honoured
    // immediately — not at the next login.
    const before = resolveActiveCompanyId(memberships(ACME, BETA), BETA);
    const after = resolveActiveCompanyId(memberships(ACME), BETA);

    expect(before).toBe(BETA);
    expect(after).toBe(ACME);
  });

  it('is not fooled by a value that merely looks like a membership', () => {
    // No prefix matching, no substring matching, no case folding: equality only.
    expect(resolveActiveCompanyId(memberships(ACME), ACME.toUpperCase())).toBe(ACME);
    expect(resolveActiveCompanyId(memberships(ACME), ACME.slice(0, 5))).toBe(ACME);
    expect(resolveActiveCompanyId(memberships(ACME), `${ACME}x`)).toBe(ACME);
  });
});

describe('malformed or missing cookie', () => {
  const rubbish: Array<string | null | undefined> = [
    undefined,
    null,
    '',
    '   ',
    'null',
    'undefined',
    '../../etc/passwd',
    "' OR 1=1 --",
    '{"companyId":"cmp_not_mine"}',
  ];

  for (const value of rubbish) {
    it(`falls back without throwing for ${JSON.stringify(value)}`, () => {
      expect(() => resolveActiveCompanyId(memberships(ACME, BETA), value)).not.toThrow();
      expect(resolveActiveCompanyId(memberships(ACME, BETA), value)).toBe(ACME);
    });
  }
});

describe('no cookie', () => {
  it('gives a single-company user their company, exactly as before', () => {
    expect(resolveActiveCompanyId(memberships(ACME), undefined)).toBe(ACME);
  });

  it('is deterministic for a user with several companies', () => {
    // The caller orders by oldest membership, so the answer is the company they
    // started with — the same one on every request, rather than whatever the
    // database happened to return first.
    const list = memberships(ACME, BETA, 'cmp_c');
    const answers = new Set([
      resolveActiveCompanyId(list, undefined),
      resolveActiveCompanyId(list, undefined),
      resolveActiveCompanyId(list, undefined),
    ]);

    expect(answers.size).toBe(1);
    expect(resolveActiveCompanyId(list, undefined)).toBe(ACME);
  });

  it('follows the order it is given rather than sorting on its own', () => {
    expect(resolveActiveCompanyId(memberships(BETA, ACME), undefined)).toBe(BETA);
  });
});

describe('no memberships', () => {
  it('returns null, which is the 403 path', () => {
    expect(resolveActiveCompanyId([], undefined)).toBeNull();
    expect(resolveActiveCompanyId([], ACME)).toBeNull();
  });

  it('cannot be talked into a company by the cookie', () => {
    // A user with no membership at all — including one whose account was
    // deactivated, since the caller's query filters on user.isActive and
    // returns nothing for them — gets no company, whatever the cookie says.
    expect(resolveActiveCompanyId([], SOMEONE_ELSES)).toBeNull();
  });
});

describe('isRequestHonoured', () => {
  it('reports true only when the stored value was used', () => {
    expect(isRequestHonoured(memberships(ACME, BETA), BETA)).toBe(true);
    expect(isRequestHonoured(memberships(ACME, BETA), SOMEONE_ELSES)).toBe(false);
    expect(isRequestHonoured(memberships(ACME), undefined)).toBe(false);
    expect(isRequestHonoured([], ACME)).toBe(false);
  });

  it('agrees with the resolution it describes', () => {
    const list = memberships(ACME, BETA);
    for (const requested of [BETA, SOMEONE_ELSES, '', undefined]) {
      const honoured = isRequestHonoured(list, requested);
      const resolved = resolveActiveCompanyId(list, requested);
      expect(honoured).toBe(resolved === (typeof requested === 'string' ? requested.trim() : requested));
    }
  });
});

describe('cookie constants', () => {
  it('names a cookie that cannot collide with the locale cookie', () => {
    expect(ACTIVE_COMPANY_COOKIE).toBe('cc_active_company');
    expect(ACTIVE_COMPANY_COOKIE).not.toBe('NEXT_LOCALE');
  });

  it('outlives a session, like the locale choice', () => {
    expect(ACTIVE_COMPANY_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});

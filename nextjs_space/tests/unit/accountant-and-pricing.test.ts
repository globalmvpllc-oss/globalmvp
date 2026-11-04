import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

// --- Mocks for exercising requireUserCompany end to end -------------------
const state = vi.hoisted(() => ({
  session: { user: { id: 'u1', email: 'm@x.test' } } as any,
  memberships: [] as Array<{ companyId: string; role: string }>,
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ getServerSession: async () => state.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({
  headers: () => ({ get: (k: string) => state.headers.get(k.toLowerCase()) ?? null }),
  cookies: () => ({ get: (k: string) => (state.cookies.has(k) ? { value: state.cookies.get(k) } : undefined) }),
}));
vi.mock('@/lib/db', () => ({
  prisma: { companyMember: { findMany: async () => state.memberships } },
}));

import { requireUserCompany } from '@/lib/auth-helpers';
import {
  accountantRefusal,
  acceptRefusal,
  canManageAccountants,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  newInviteToken,
  INVITE_TTL_DAYS,
} from '@/lib/accountant/rules';
import { REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from '@/lib/accountant/headers';
import { AUDIT_ACTIONS } from '@/lib/admin/audit-rules';
import {
  LEGACY_TRIAL_DAYS,
  SEVEN_DAY_TRIAL_FROM,
  TRIAL_DAYS,
  trialDaysFor,
  trialEndsAt,
  trialReminderKind,
} from '@/lib/billing/trial';
import { pricingCurrencyFor } from '@/lib/billing/pricing-region';
import { readPrice } from '@/lib/billing/pricing-server';
import { accountantInviteEmail, trialReminderEmail } from '@/lib/email/templates';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');
const DAY = 86_400_000;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

// =========================================================================
// A — accountant access
// =========================================================================

describe('the read-only rule', () => {
  it('lets an accountant read and nothing else', () => {
    const r = (method: string, pathname = '/api/invoices') => accountantRefusal({ role: 'accountant', method, pathname });
    expect(r('GET')).toBeNull();
    expect(r('HEAD')).toBeNull();
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) expect(r(m)?.code, m).toBe('READ_ONLY');
  });

  it('closes billing and accountant management to accountants, even for reading', () => {
    for (const p of ['/api/billing/checkout', '/api/billing/portal', '/api/billing', '/api/company/accountants', '/api/company/accountants/x']) {
      expect(accountantRefusal({ role: 'accountant', method: 'GET', pathname: p })?.code, p).toBe('NOT_FOR_ACCOUNTANT');
    }
  });

  it('fails closed when the middleware headers are missing', () => {
    expect(accountantRefusal({ role: 'accountant', method: null, pathname: null })).not.toBeNull();
    expect(accountantRefusal({ role: 'accountant', method: 'GET', pathname: null })).not.toBeNull();
    expect(accountantRefusal({ role: 'accountant', method: null, pathname: '/api/invoices' })).not.toBeNull();
  });

  it('does not touch any other role', () => {
    for (const role of ['owner', 'admin', 'member']) {
      expect(accountantRefusal({ role, method: 'DELETE', pathname: '/api/billing/checkout' })).toBeNull();
    }
  });

  it('only owners and admins manage accountants', () => {
    expect(canManageAccountants('owner')).toBe(true);
    expect(canManageAccountants('admin')).toBe(true);
    expect(canManageAccountants('accountant')).toBe(false);
    expect(canManageAccountants('member')).toBe(false);
  });
});

describe('requireUserCompany enforces it on the server', () => {
  beforeEach(() => {
    state.session = { user: { id: 'u1', email: 'm@x.test' } };
    state.memberships = [{ companyId: 'c1', role: 'accountant' }];
    state.headers = new Map();
    state.cookies = new Map();
  });
  const req = (method: string, pathname: string) => {
    state.headers.set(REQUEST_METHOD_HEADER, method);
    state.headers.set(REQUEST_PATH_HEADER, pathname);
  };

  it('accountant: GET passes with the role, any change is 403 READ_ONLY', async () => {
    req('GET', '/api/invoices');
    const ok = await requireUserCompany();
    expect(ok.error).toBeNull();
    expect(ok.role).toBe('accountant');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      req(method, '/api/invoices/abc');
      const res = await requireUserCompany();
      expect(res.error?.status, method).toBe(403);
      expect(await res.error!.json()).toMatchObject({ code: 'READ_ONLY' });
    }
  });

  it('accountant: billing is refused even for GET', async () => {
    req('GET', '/api/billing/portal');
    const res = await requireUserCompany();
    expect(res.error?.status).toBe(403);
  });

  it('accountant: refused when the method header is absent (no middleware)', async () => {
    const res = await requireUserCompany();
    expect(res.error?.status).toBe(403);
  });

  it('owner: unaffected', async () => {
    state.memberships = [{ companyId: 'c1', role: 'owner' }];
    req('DELETE', '/api/invoices/abc');
    const res = await requireUserCompany();
    expect(res.error).toBeNull();
    expect(res.companyId).toBe('c1');
  });

  it('the role follows the active company: owner in one, accountant in another', async () => {
    state.memberships = [
      { companyId: 'own', role: 'owner' },
      { companyId: 'client', role: 'accountant' },
    ];
    state.cookies.set('cc_active_company', 'client');
    req('POST', '/api/invoices');
    expect((await requireUserCompany()).error?.status).toBe(403);
    state.cookies.set('cc_active_company', 'own');
    expect((await requireUserCompany()).error).toBeNull();
  });
});

describe('every API route is covered', () => {
  // Routes that do not act on a company's records, each with its own check.
  const NOT_COMPANY_SCOPED: Record<string, string> = {
    'app/api/auth/': 'NextAuth and password flows',
    'app/api/signup/': 'creates a user',
    'app/api/webhooks/': 'provider signature',
    'app/api/cron/': 'CRON_SECRET',
    'app/api/admin/': 'platform admin',
    'app/api/accountant/': 'the accountant’s own invitation/leave, session-checked',
    'app/api/company/route.ts': 'POST creates the user’s own company; GET reads the active one; PUT uses requireUserCompany',
    'app/api/companies/route.ts': 'lists the user’s memberships',
  };
  const exempt = (file: string) => Object.keys(NOT_COMPANY_SCOPED).some((p) => file.startsWith(p));
  const files = routeFiles(path.join(root, 'app/api'));

  it('finds the routes', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.filter((f) => !exempt(f)))('%s goes through requireUserCompany', (file) => {
    const text = src(file);
    expect(text).toContain('requireUserCompany()');
    // No company route resolves the company another way.
    expect(text).not.toMatch(/getUserCompanyId\(\)/);
  });

  it('no GET handler changes data (so "GET only" really is read-only)', () => {
    for (const file of files) {
      const text = src(file);
      const get = text.split('export async function GET')[1]?.split(/\nexport async function /)[0] ?? '';
      expect(get, file).not.toMatch(/\.(create|update|upsert|delete|deleteMany|updateMany|createMany)\(|sendMail\(/);
    }
  });

  it('the middleware always stamps the real method and path', () => {
    const mw = src('middleware.ts');
    expect(mw).toContain('headers.set(REQUEST_METHOD_HEADER, req.method);');
    expect(mw).toContain('headers.set(REQUEST_PATH_HEADER, pathname);');
    expect(mw).toContain("pathname.startsWith('/invite/')");
    expect(mw).toContain("pathname.startsWith('/api/accountant/public/')");
  });
});

describe('accountant self-service routes', () => {
  it('leaving deletes only the caller’s own accountant membership', () => {
    const route = src('app/api/accountant/leave/route.ts');
    expect(route).toContain('where: { userId: session.id, companyId, role: ACCOUNTANT_ROLE }');
  });
  it('accepting requires the invited address', () => {
    expect(src('app/api/accountant/accept/route.ts')).toContain('acceptRefusal(invite, account.email)');
  });
  it('the owner endpoints check the role and remove only accountants', () => {
    const list = src('app/api/company/accountants/route.ts');
    expect(list.match(/canManageAccountants\(auth\.role\)/g)?.length).toBe(2);
    const one = src('app/api/company/accountants/[id]/route.ts');
    expect(one).toContain('canManageAccountants(auth.role)');
    expect(one).toContain('role: ACCOUNTANT_ROLE');
  });
});

describe('invitations', () => {
  const now = new Date('2026-11-06T10:00:00Z');
  it('last 7 days, store only a hash, and are single-use', () => {
    expect(INVITE_TTL_DAYS).toBe(7);
    expect(inviteExpiry(now).getTime() - now.getTime()).toBe(7 * DAY);
    const { token, tokenHash } = newInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toContain(token);
    const base = { email: 'm@x.test', expiresAt: inviteExpiry(now) };
    expect(inviteState(base, now)).toBe('usable');
    expect(inviteState(base, new Date(now.getTime() + 8 * DAY))).toBe('expired');
    expect(inviteState({ ...base, acceptedAt: now }, now)).toBe('used');
    expect(inviteState({ ...base, revokedAt: now }, now)).toBe('revoked');
  });
  it('are accepted only by the invited address', () => {
    const invite = { email: 'Musavir@X.test', expiresAt: inviteExpiry(now) };
    expect(acceptRefusal(invite, 'musavir@x.test', now)).toBeNull();
    expect(acceptRefusal(invite, 'other@x.test', now)).toBe('wrong-account');
  });
  it('the claim is conditional, so a link cannot be used twice', () => {
    expect(src('lib/accountant/invites.ts')).toContain('where: { id: inviteId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }');
  });
  it('email: one button, the 7-day note, both languages', () => {
    const tr = accountantInviteEmail({ locale: 'tr', companyName: 'Örnek Ltd', inviterName: 'Ayşe', url: 'https://corpcontrol.net/invite/abc' });
    expect(tr.subject).toContain('Örnek Ltd');
    expect(tr.html).toContain('https://corpcontrol.net/invite/abc');
    expect(tr.text).toContain('7 gün');
    const en = accountantInviteEmail({ locale: 'en', companyName: 'Acme', inviterName: 'Ann', url: 'https://x/invite/abc' });
    expect(en.subject).toContain('accountant');
  });
});

describe('plans, PDFs and the audit log', () => {
  it('an accountant’s downloads skip the PDF allowance and are logged', () => {
    for (const file of [
      'app/api/invoices/[id]/pdf/route.ts',
      'app/api/quotes/[id]/pdf/route.ts',
      'app/api/customers/[id]/statement/route.ts',
      'app/api/vendors/[id]/statement/route.ts',
    ]) {
      const text = src(file);
      expect(text, file).toContain("isAccountant(role) ? null : await enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
      expect(text, file).toContain('recordAccountantDownload(auth, request');
    }
    expect(src('app/api/pdf/[kind]/route.ts')).toContain('recordAccountantDownload(auth, request');
    const exp = src('app/api/export/[dataset]/route.ts');
    // Export follows the company's plan for everyone, accountants included.
    expect(exp).toContain('if (!planDelivers(plan, capability)) {');
    expect(exp).not.toContain('isAccountant');
    expect(exp).toContain('recordAccountantDownload(auth, request');
  });
  it('accountants are not seats: nothing counts memberships against a plan', () => {
    expect(src('lib/billing/limits.ts')).not.toMatch(/companyMember\.count/);
  });
  it('sign-ins, downloads and changes of access are audit actions', () => {
    for (const a of ['accountant.signin', 'accountant.download', 'accountant.invited', 'accountant.removed', 'accountant.left', 'accountant.joined']) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(a);
    }
    expect(src('lib/auth.ts')).toContain("action: 'accountant.signin'");
  });
});

describe('screens', () => {
  it('banner, read-only context and hidden settings for an accountant', () => {
    const layout = src('app/(app)/layout.tsx');
    expect(layout).toContain('<AccountantBanner');
    expect(layout).toContain('<ReadOnlyProvider value={readOnly}>');
    expect(layout).toContain('<AppSidebar readOnly={readOnly} />');
    expect(src('app/(app)/settings/layout.tsx')).toContain("redirect('/dashboard')");
    expect(src('components/app-sidebar.tsx')).toContain("!readOnly || !item.href.startsWith('/settings')");
  });
  it('change buttons are hidden on the main screens', () => {
    for (const file of ['invoices', 'quotes', 'recurring', 'customers', 'expenses', 'income', 'payments', 'cheques', 'banking', 'calendar']) {
      expect(src(`app/(app)/${file}/page.tsx`), file).toContain('<CanEdit>');
    }
  });
  it('the owner sees accountant access in Settings', () => {
    expect(src('app/(app)/settings/page.tsx')).toContain('<AccountantAccess />');
  });
});

// =========================================================================
// B — trial and Turkish prices
// =========================================================================

describe('7-day trial', () => {
  it('new companies get 7 days; earlier ones keep their 15', () => {
    expect(TRIAL_DAYS).toBe(7);
    const fresh = new Date(SEVEN_DAY_TRIAL_FROM.getTime() + DAY);
    expect(trialDaysFor(fresh)).toBe(7);
    expect(trialEndsAt(fresh)!.getTime() - fresh.getTime()).toBe(7 * DAY);
    const older = new Date(SEVEN_DAY_TRIAL_FROM.getTime() - DAY);
    expect(trialDaysFor(older)).toBe(LEGACY_TRIAL_DAYS);
  });
  it('reminders: two days before, and on the day it ends', () => {
    // The job runs at 04:00 UTC; the trial ends at 22:00 UTC on the 20th.
    const ends = new Date('2026-11-20T22:00:00Z');
    expect(trialReminderKind(ends, new Date('2026-11-17T04:00:00Z'))).toBeNull();
    expect(trialReminderKind(ends, new Date('2026-11-18T04:00:00Z'))).toBe('soon');
    expect(trialReminderKind(ends, new Date('2026-11-19T04:00:00Z'))).toBeNull();
    expect(trialReminderKind(ends, new Date('2026-11-20T04:00:00Z'))).toBe('ended');
    expect(trialReminderKind(ends, new Date('2026-11-21T04:00:00Z'))).toBeNull();
  });
  it('the reminder job is daily, once per company, owners only, paying companies skipped', () => {
    const job = src('lib/cron/trial-reminders.ts');
    expect(job).toContain("role: 'owner'");
    expect(job).toContain('if (granted || company.subscription) continue;');
    expect(job).toContain('const already = await prisma.auditLog.findFirst');
    expect(src('app/api/cron/daily/route.ts')).toContain('sendTrialReminders(now)');
    const tr = trialReminderEmail({ locale: 'tr', kind: 'ended', companyName: 'Örnek', endsAt: new Date(), url: 'https://x/settings/billing' });
    expect(tr.text).toContain('Verileriniz silinmez');
    expect(tr.subject).toBe('Pro denemeniz bugün bitiyor');
  });
});

describe('review fixes', () => {
  it('trial anchor: founder is the oldest owner; accountant memberships never count', () => {
    const anchor = src('lib/billing/trial-anchor.ts');
    expect(anchor).toContain("where: { companyId, role: 'owner' },");
    expect(anchor).toContain("where: { role: { not: 'accountant' } },");
  });
  it('checkout charges lira only when the cards show lira', () => {
    expect(src('app/api/billing/checkout/route.ts')).toContain("shown.prices[plan]?.[interval]?.currency === 'TRY'");
  });
  it('invitations are rate limited; a double sign-up answers ACCOUNT_EXISTS', () => {
    expect(src('app/api/company/accountants/route.ts')).toContain('ACCOUNTANT_INVITE_RULE');
    expect(src('app/api/accountant/public/register/route.ts')).toContain("=== 'P2002'");
  });
  it('the reminder job is not capped', () => {
    expect(src('lib/cron/trial-reminders.ts')).not.toMatch(/take:\s*\d+/);
  });
});

describe('Turkish prices', () => {
  it('Turkey (visitor or company) is quoted in TRY; everyone else in USD', () => {
    expect(pricingCurrencyFor({ visitorCountry: 'TR' })).toBe('TRY');
    expect(pricingCurrencyFor({ companyCountry: 'tr', visitorCountry: 'DE' })).toBe('TRY');
    expect(pricingCurrencyFor({ visitorCountry: 'US', companyCountry: 'US' })).toBe('USD');
    expect(pricingCurrencyFor({})).toBe('USD');
  });
  it('a product with USD and TRY prices is read per currency', () => {
    const product = {
      prices: [
        { amountType: 'fixed', priceAmount: 29900, priceCurrency: 'try', isArchived: false },
        { amountType: 'fixed', priceAmount: 1200, priceCurrency: 'usd', isArchived: false },
      ],
    };
    expect(readPrice(product, 'USD')).toEqual({ amount: 12, currency: 'USD' });
    expect(readPrice(product, 'TRY')).toEqual({ amount: 299, currency: 'TRY' });
    expect(readPrice({ prices: [product.prices[1]] }, 'TRY')).toBeNull();
  });
  it('checkout asks Polar for lira only when the shown price is in lira', () => {
    const route = src('app/api/billing/checkout/route.ts');
    expect(route).toContain("await getPlanPricing('TRY')");
    expect(route).toContain('...(currency ? { currency } : {})');
    expect(route).toContain('customerIpAddress: requestIp()');
  });
  it('the price cards say "KDV dahil" and "2 ay bedava" for lira', () => {
    const cards = src('components/billing-plans.tsx');
    expect(cards).toContain("t('billing.vatIncluded')");
    expect(cards).toContain("t('billing.twoMonthsFree')");
  });
});

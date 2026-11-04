import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Excel/CSV export gate, exercised through the real route handler.
 *
 * Owner decision (2026-11-04): an accountant may export on every plan, Free
 * included; everyone else needs a plan that delivers `dataExport` (Pro and
 * up). The session, plan and data are stubbed; the decision is the route's.
 */
const state = vi.hoisted(() => ({
  role: 'owner' as string,
  plan: 'free' as string,
  planLookups: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-helpers', () => ({
  requireUserCompany: async () => ({
    error: null,
    user: { id: 'u1', email: 'u@x.test' },
    companyId: 'c1',
    role: state.role,
  }),
}));
vi.mock('@/lib/billing/limits', () => ({
  getCurrentPlan: async () => {
    state.planLookups += 1;
    return state.plan;
  },
}));
vi.mock('@/lib/i18n/server', () => ({ getServerLocale: () => 'tr' }));
vi.mock('@/lib/export/datasets', () => ({
  isExportDataset: (v: unknown) => v === 'invoices',
  buildExportTables: async () => [{ name: 'Faturalar', columns: [{ header: 'No' }], rows: [['F-1']] }],
}));
vi.mock('@/lib/accountant/audit', () => ({ recordAccountantDownload: async () => {} }));

import { GET } from '@/app/api/export/[dataset]/route';

const call = () => GET(new Request('https://x.test/api/export/invoices?format=csv'), { params: { dataset: 'invoices' } });

describe('Excel/CSV export plan gate', () => {
  beforeEach(() => {
    state.planLookups = 0;
  });

  it('a Free-plan owner is refused with 402', async () => {
    state.role = 'owner';
    state.plan = 'free';
    const res = await call();
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN' });
  });

  it('a Pro owner exports', async () => {
    state.role = 'owner';
    state.plan = 'pro';
    expect((await call()).status).toBe(200);
  });

  it('an accountant exports on a Free company, without a plan lookup', async () => {
    state.role = 'accountant';
    state.plan = 'free';
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(state.planLookups).toBe(0);
  });

  it('other members follow the plan', async () => {
    state.role = 'member';
    state.plan = 'free';
    expect((await call()).status).toBe(402);
  });
});

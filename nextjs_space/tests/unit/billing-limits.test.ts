import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  CAPABILITIES,
  limitFor,
  isOverLimit,
  planMeets,
  planIncludes,
  planDelivers,
  availableCapabilities,
  plannedCapabilities,
  type LimitedResource,
} from '@/lib/billing/features';
import { yearlySaving, type PlanPrice } from '@/lib/billing/pricing';
import { en, tr, translate, type TranslationKey } from '@/lib/i18n';

/**
 * Plan limits, gates and pricing arithmetic.
 *
 * These are the numbers the API enforces and the figures the page quotes, so a
 * silent change here would either let someone past a paid ceiling or misstate a
 * discount. Both are pinned.
 */

const MONTHLY: LimitedResource[] = [
  'invoicesPerMonth',
  'incomePerMonth',
  'expensesPerMonth',
  'invoicePdfPerMonth',
];
const ALL: LimitedResource[] = ['customers', ...MONTHLY];

describe('plan limits', () => {
  it('gives Free the documented allowances', () => {
    expect(PLAN_LIMITS.free).toEqual({
      customers: 3,
      invoicesPerMonth: 20,
      incomePerMonth: 100,
      expensesPerMonth: 100,
      invoicePdfPerMonth: 20,
      teamMembers: 1,
    });
  });

  it('gives Pro the documented allowances', () => {
    expect(PLAN_LIMITS.pro).toEqual({
      customers: 500,
      invoicesPerMonth: 500,
      incomePerMonth: 1000,
      expensesPerMonth: 1000,
      invoicePdfPerMonth: 500,
      teamMembers: 1,
    });
  });

  it.each(ALL)('makes Business unlimited for %s', (resource) => {
    expect(limitFor('business', resource)).toBeNull();
  });

  it('raises every countable ceiling from Free to Pro', () => {
    for (const resource of ALL) {
      expect(limitFor('pro', resource)!).toBeGreaterThan(limitFor('free', resource)!);
    }
  });
});

describe('limit enforcement boundary', () => {
  it.each([
    ['free', 'invoicesPerMonth', 20],
    ['pro', 'invoicesPerMonth', 500],
    ['free', 'customers', 3],
    ['pro', 'customers', 500],
    ['free', 'incomePerMonth', 100],
    ['pro', 'incomePerMonth', 1000],
    ['free', 'expensesPerMonth', 100],
    ['pro', 'expensesPerMonth', 1000],
    ['free', 'invoicePdfPerMonth', 20],
    ['pro', 'invoicePdfPerMonth', 500],
  ] as const)('%s blocks %s at %d', (plan, resource, limit) => {
    // One below the ceiling still passes; at the ceiling the next record is refused.
    expect(isOverLimit(plan, resource, limit - 1)).toBe(false);
    expect(isOverLimit(plan, resource, limit)).toBe(true);
    expect(isOverLimit(plan, resource, limit + 5)).toBe(true);
  });

  it.each(ALL)('never blocks Business on %s, however many exist', (resource) => {
    expect(isOverLimit('business', resource, 0)).toBe(false);
    expect(isOverLimit('business', resource, 10_000)).toBe(false);
    expect(isOverLimit('business', resource, 1_000_000)).toBe(false);
  });

  it('blocks an empty company only if a limit were zero', () => {
    for (const resource of ALL) {
      expect(isOverLimit('free', resource, 0)).toBe(false);
    }
  });
});

describe('plan ordering', () => {
  it.each([
    ['free', 'free', true],
    ['pro', 'free', true],
    ['business', 'free', true],
    ['free', 'pro', false],
    ['pro', 'pro', true],
    ['business', 'pro', true],
    ['free', 'business', false],
    ['pro', 'business', false],
    ['business', 'business', true],
  ] as const)('%s meets %s = %s', (plan, required, expected) => {
    expect(planMeets(plan, required)).toBe(expected);
  });
});

describe('feature gates', () => {
  const byId = (id: string) => CAPABILITIES.find((capability) => capability.id === id)!;

  it.each(['advancedReports', 'dataExport', 'bulkExport'])('gates %s behind Pro', (id) => {
    const capability = byId(id);
    expect(capability.requires).toBe('pro');
    expect(planIncludes('free', capability)).toBe(false);
    expect(planIncludes('pro', capability)).toBe(true);
    expect(planIncludes('business', capability)).toBe(true);
  });

  it.each(['teamMembers', 'businessControls', 'prioritySupport'])(
    'gates %s behind Business',
    (id) => {
      const capability = byId(id);
      expect(capability.requires).toBe('business');
      expect(planIncludes('free', capability)).toBe(false);
      expect(planIncludes('pro', capability)).toBe(false);
      expect(planIncludes('business', capability)).toBe(true);
    }
  );

  it('never reports a planned capability as delivered', () => {
    // The whole point of the status flag: covered by the plan is not the same
    // as usable today, and only the second may be ticked.
    for (const capability of CAPABILITIES.filter((c) => c.status === 'planned')) {
      for (const plan of ['free', 'pro', 'business'] as const) {
        expect(planDelivers(plan, capability)).toBe(false);
      }
    }
  });

  it('keeps every shipped capability available on every plan', () => {
    // Existing functionality is not taken away from anyone who has it today.
    for (const capability of CAPABILITIES.filter((c) => c.status === 'available')) {
      for (const plan of ['free', 'pro', 'business'] as const) {
        expect(planDelivers(plan, capability)).toBe(true);
      }
    }
  });

  it('lists planned items separately from available ones', () => {
    const available = availableCapabilities('business');
    const planned = plannedCapabilities('business');
    expect(planned.length).toBeGreaterThan(0);
    for (const capability of planned) {
      expect(available).not.toContain(capability);
    }
  });
});

describe('yearly saving', () => {
  const usd = (amount: number): PlanPrice => ({ amount, currency: 'USD' });

  it('computes 1 - yearly / (monthly * 12)', () => {
    const saving = yearlySaving(usd(10), usd(96))!;
    expect(saving.monthlyTotal).toBe(120);
    expect(saving.yearlyTotal).toBe(96);
    expect(saving.saved).toBe(24);
    expect(saving.perMonth).toBe(8);
    expect(saving.percent).toBe(20);
  });

  it('keeps the arithmetic internally consistent', () => {
    const saving = yearlySaving(usd(9.99), usd(95.9))!;
    expect(saving.saved + saving.yearlyTotal).toBeCloseTo(saving.monthlyTotal, 6);
    expect(saving.perMonth * 12).toBeCloseTo(saving.yearlyTotal, 6);
  });

  it('claims nothing when the yearly plan is not cheaper', () => {
    expect(yearlySaving(usd(10), usd(120))).toBeNull();
    expect(yearlySaving(usd(10), usd(130))).toBeNull();
  });

  it('claims nothing across currencies or with a missing price', () => {
    expect(yearlySaving({ amount: 10, currency: 'USD' }, { amount: 100, currency: 'EUR' })).toBeNull();
    expect(yearlySaving(undefined, usd(96))).toBeNull();
    expect(yearlySaving(usd(10), undefined)).toBeNull();
  });
});

describe('billing vocabulary', () => {
  const keys = (Object.keys(en) as TranslationKey[]).filter(
    (key) => key.startsWith('billing.') || key.startsWith('feature.') || key.startsWith('limit.')
  );

  it('is fully translated', () => {
    for (const key of keys) {
      expect(tr[key], `missing tr for ${key}`).toBeTruthy();
    }
  });

  it('names every capability in both languages', () => {
    for (const capability of CAPABILITIES) {
      expect(translate('en', capability.labelKey)).not.toBe(capability.labelKey);
      expect(translate('tr', capability.labelKey)).not.toBe(capability.labelKey);
    }
  });

  it('keeps the placeholders the limit messages substitute', () => {
    for (const key of ['limit.invoices', 'limit.customers', 'limit.income', 'limit.expenses'] as TranslationKey[]) {
      expect(en[key]).toContain('{limit}');
      expect(tr[key]).toContain('{limit}');
      expect(en[key]).toContain('{plan}');
      expect(tr[key]).toContain('{plan}');
    }
  });

  it('says plainly that planned features are not available yet', () => {
    expect(en['billing.plannedNote'].length).toBeGreaterThan(40);
    expect(tr['billing.plannedNote'].length).toBeGreaterThan(40);
    expect(en['billing.teamMembersNote'].length).toBeGreaterThan(40);
    expect(tr['billing.teamMembersNote'].length).toBeGreaterThan(40);
  });
});

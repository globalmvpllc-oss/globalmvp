import { describe, it, expect } from 'vitest';
import { en, tr, translate, type TranslationKey } from '@/lib/i18n';
import { billingState, currentPlan, type SubscriptionLike } from '@/lib/billing/access';
import { isBillingConfigured } from '@/lib/billing/plans';

/**
 * What the billing screen is allowed to say.
 *
 * The page renders straight from a Subscription row, so the risk is not
 * arithmetic — it is labelling: calling a cancelled subscription "renewing",
 * or offering a live-looking action while checkout does not exist.
 */

const NOW = new Date('2026-06-15T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function sub(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: days(20),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

/** The keys the page maps each state and plan onto. */
const STATE_LABEL: Record<string, TranslationKey> = {
  active: 'billing.statusActive',
  trialing: 'billing.statusTrialing',
  past_due: 'billing.statusPastDue',
  canceling: 'billing.statusCanceling',
  expired: 'billing.statusExpired',
};

const PLAN_LABEL: Record<string, TranslationKey> = {
  free: 'billing.planFree',
  pro: 'billing.planPro',
  business: 'billing.planBusiness',
};

describe('every state and plan the page can reach has a label', () => {
  it.each(['free', 'trialing', 'active', 'past_due', 'canceling', 'expired'])(
    'state %s resolves to a translated label in both languages',
    (state) => {
      if (state === 'free') return; // free is shown via the plan label
      const key = STATE_LABEL[state];
      expect(key, `no label mapped for state ${state}`).toBeTruthy();
      expect(translate('en', key)).toBeTruthy();
      expect(translate('tr', key)).toBeTruthy();
    }
  );

  it.each(['free', 'pro', 'business'])('plan %s has a label in both languages', (plan) => {
    const key = PLAN_LABEL[plan];
    expect(key).toBeTruthy();
    expect(translate('en', key)).toBeTruthy();
    expect(translate('tr', key)).toBeTruthy();
  });

  it('never falls back to showing a raw key', () => {
    for (const key of Object.values({ ...STATE_LABEL, ...PLAN_LABEL })) {
      expect(translate('tr', key)).not.toBe(key);
      expect(translate('en', key)).not.toBe(key);
    }
  });
});

describe('the renewal label matches reality', () => {
  /** Mirrors the page: a cancelled or lapsed period is an end, not a renewal. */
  const dateLabelKey = (s: SubscriptionLike | null): TranslationKey => {
    const state = billingState(s, NOW);
    return state === 'canceling' || state === 'expired' ? 'billing.endsOn' : 'billing.renewalDate';
  };

  it('calls it a renewal date on an active subscription', () => {
    expect(dateLabelKey(sub())).toBe('billing.renewalDate');
  });

  it('calls it an end date once cancelled', () => {
    // Saying "renewal date" here would tell the user they will be charged again.
    expect(dateLabelKey(sub({ cancelAtPeriodEnd: true }))).toBe('billing.endsOn');
  });

  it('calls it an end date once expired', () => {
    expect(dateLabelKey(sub({ status: 'revoked' }))).toBe('billing.endsOn');
  });

  it('still calls it a renewal date while past_due, because Polar is retrying', () => {
    expect(dateLabelKey(sub({ status: 'past_due' }))).toBe('billing.renewalDate');
  });
});

describe('a company with no subscription is Free', () => {
  it('reports the free plan', () => {
    expect(currentPlan(null, NOW)).toBe('free');
    expect(billingState(null, NOW)).toBe('free');
  });

  it('is distinguishable from a lapsed subscription', () => {
    // The screen says different things: "you are on Free" vs "your plan expired".
    expect(billingState(null, NOW)).not.toBe(billingState(sub({ status: 'revoked' }), NOW));
  });
});

describe('actions stay disabled until billing is configured', () => {
  it('is unavailable with no Polar configuration', () => {
    // Stage 4-7 endpoints do not exist; the page must not offer a live action.
    expect(isBillingConfigured({})).toBe(false);
  });

  it('explains the unavailability in both languages', () => {
    for (const key of ['billing.notConfigured', 'billing.notConfiguredNote'] as TranslationKey[]) {
      expect(translate('en', key).length).toBeGreaterThan(5);
      expect(translate('tr', key).length).toBeGreaterThan(5);
    }
  });
});

describe('billing vocabulary is fully translated', () => {
  const billingKeys = (Object.keys(en) as TranslationKey[]).filter(
    (k) => k.startsWith('billing.') || k === 'nav.billing'
  );

  it('has a meaningful number of billing keys', () => {
    expect(billingKeys.length).toBeGreaterThan(20);
  });

  it('covers every billing key in Turkish', () => {
    for (const key of billingKeys) {
      expect(tr[key], `missing tr for ${key}`).toBeTruthy();
    }
  });

  it('translates the navigation entry rather than copying English', () => {
    expect(translate('tr', 'nav.billing')).not.toBe(translate('en', 'nav.billing'));
  });
});

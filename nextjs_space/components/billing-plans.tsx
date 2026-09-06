'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Minus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/i18n-provider';
import { BillingActions } from '@/components/billing-actions';
import { formatCurrency } from '@/lib/currencies';
import {
  CAPABILITIES,
  PLAN_LIMITS,
  planIncludes,
  planDelivers,
  availableCapabilities,
  plannedCapabilities,
  type LimitedResource,
} from '@/lib/billing/features';
import type { PlanPrices, YearlySaving } from '@/lib/billing/pricing';
import type { Plan, PaidPlan, BillingInterval } from '@/lib/billing/plans';
import type { TranslationKey } from '@/lib/i18n';

/**
 * Plans, prices, limits and the comparison table.
 *
 * A client component only for the interval toggle; the prices come from the
 * server, read from Polar. The interval chosen here is what checkout receives,
 * and the route resolves the Polar product from plan + interval server-side —
 * so what the reader is looking at is what they are sent to pay.
 *
 * Limits shown here are the same constants the API enforces, imported rather
 * than restated, so the page cannot drift from what the server actually does.
 */

const PLANS = ['free', 'pro', 'business'] as const;

const PLAN_NAME: Record<Plan, TranslationKey> = {
  free: 'billing.planFree',
  pro: 'billing.planPro',
  business: 'billing.planBusiness',
};

const TAGLINE: Record<Plan, TranslationKey> = {
  free: 'billing.planFreeTagline',
  pro: 'billing.planProTagline',
  business: 'billing.planBusinessTagline',
};

/** Rows whose cells are a number rather than a tick. */
const LIMIT_ROWS: Array<{ labelKey: TranslationKey; resource: LimitedResource; monthly: boolean }> = [
  { labelKey: 'feature.customers', resource: 'customers', monthly: false },
  { labelKey: 'feature.invoices', resource: 'invoicesPerMonth', monthly: true },
  { labelKey: 'feature.income', resource: 'incomePerMonth', monthly: true },
  { labelKey: 'feature.expenses', resource: 'expensesPerMonth', monthly: true },
  { labelKey: 'feature.invoicePdf', resource: 'invoicePdfPerMonth', monthly: true },
];

/** Capabilities shown as ticks — the limit rows above cover the rest. */
const TICK_ROWS = CAPABILITIES.filter(
  (capability) => !LIMIT_ROWS.some((row) => row.labelKey === capability.labelKey)
);

export function PlanSelector({
  currentPlan,
  prices,
  savings,
  actionsAvailable,
  plannedInCards = true,
}: {
  currentPlan: Plan;
  prices: PlanPrices;
  savings: Partial<Record<PaidPlan, YearlySaving | null>>;
  actionsAvailable: boolean;
  /**
   * Whether the plan cards list capabilities that are named by a plan but not
   * built yet.
   *
   * True inside the account, where a subscriber is entitled to see everything
   * their plan covers. False on the public marketing pages: a visitor arriving
   * from an ad is deciding what to pay for today, and a "What's included" list
   * should therefore only contain what actually works today. The capabilities
   * are not hidden — they stay in the comparison table below, with the same
   * Planned badge and the same explanatory note.
   */
  plannedInCards?: boolean;
}) {
  const { t } = useI18n();
  const [interval, setInterval] = useState<BillingInterval>('month');

  const fill = (key: TranslationKey, values: Record<string, string | number>) =>
    Object.entries(values).reduce<string>(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      t(key)
    );

  /** A limit as the reader should see it: a number, or "Unlimited". */
  const limitLabel = (plan: Plan, resource: LimitedResource, monthly: boolean) => {
    const limit = PLAN_LIMITS[plan][resource];
    if (limit === null) return t('billing.unlimited');
    return `${limit.toLocaleString()}${monthly ? ` ${t('billing.perMonthShort')}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1" role="group">
          {(['month', 'year'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={interval === option}
              onClick={() => setInterval(option)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                interval === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(option === 'month' ? 'billing.monthlyInterval' : 'billing.yearlyInterval')}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan;
          const price = plan === 'free' ? undefined : prices[plan]?.[interval];
          const saving = plan === 'free' ? null : savings[plan] ?? null;
          const planned = plannedCapabilities(plan);

          return (
            <Card
              key={plan}
              className={cn(
                'flex h-full flex-col',
                isCurrent && 'border-primary ring-1 ring-primary/20'
              )}
            >
              <CardContent className="flex flex-1 flex-col space-y-4 py-5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-bold">{t(PLAN_NAME[plan])}</p>
                    {isCurrent ? (
                      <Badge variant="secondary" className="shrink-0">
                        {t('billing.currentPlanBadge')}
                      </Badge>
                    ) : null}
                  </div>
                  {/* Fixed height so the three taglines line up whatever their length. */}
                  <p className="min-h-[2rem] text-xs text-muted-foreground">{t(TAGLINE[plan])}</p>
                </div>

                {plan === 'free' ? (
                  <p className="font-mono text-2xl font-bold">{formatCurrency(0, 'USD')}</p>
                ) : price ? (
                  <div className="space-y-1">
                    <p className="font-mono text-2xl font-bold">
                      {formatCurrency(price.amount, price.currency)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        {t(interval === 'year' ? 'billing.perYear' : 'billing.perMonth')}
                      </span>
                    </p>

                    {interval === 'year' && saving ? (
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>
                          {fill('billing.equivalentPerMonth', {
                            perMonth: formatCurrency(saving.perMonth, price.currency),
                          })}
                        </p>
                        <p>
                          {fill('billing.twelveMonthsCost', {
                            total: formatCurrency(saving.monthlyTotal, price.currency),
                          })}
                        </p>
                        <p className="font-medium text-foreground">
                          {fill('billing.youSavePerYear', {
                            saved: formatCurrency(saving.saved, price.currency),
                          })}
                        </p>
                        <Badge variant="secondary" className="mt-1">
                          {fill('billing.savePercent', { percent: saving.percent })}
                        </Badge>
                      </div>
                    ) : null}

                    {interval === 'month' && saving ? (
                      <p className="text-xs text-muted-foreground">
                        {fill('billing.yearlyExplainer', { percent: saving.percent })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  /* The price could not be read from Polar. Saying "loading"
                     would be untrue - nothing is still in flight - and quoting
                     a number would be worse. The card simply carries no figure,
                     and the reader can still reach checkout, where Polar shows
                     the real price before anything is charged. */
                  <p className="min-h-[2.5rem] text-sm text-muted-foreground">
                    {t('billing.priceOnCheckout')}
                  </p>
                )}

                {plan !== 'free' && !isCurrent ? (
                  <BillingActions
                    enabled={actionsAvailable}
                    showUpgrade
                    onlyPlan={plan}
                    interval={interval}
                  />
                ) : null}

                {/* Limits first: they are the substance of the plan. */}
                <ul className="space-y-1 border-t border-border pt-3 text-xs">
                  {LIMIT_ROWS.map((row) => (
                    <li key={row.resource} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{t(row.labelKey)}</span>
                      <span className="font-medium">
                        {limitLabel(plan, row.resource, row.monthly)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div>
                  <p className="mb-2 text-xs font-medium">{t('billing.whatsIncluded')}</p>
                  <ul className="space-y-1">
                    {availableCapabilities(plan)
                      .filter((capability) => TICK_ROWS.includes(capability))
                      .map((capability) => (
                        <li key={capability.id} className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{t(capability.labelKey)}</span>
                        </li>
                      ))}

                    {/* Named by the plan but not built. Marked, never ticked.
                        Omitted from the public cards; see plannedInCards. */}
                    {(plannedInCards ? planned : []).map((capability) => (
                      <li
                        key={capability.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>{t(capability.labelKey)}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {t('billing.planned')}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {t('billing.plannedNote')} {t('billing.teamMembersNote')}
      </p>

      {/* Comparison table */}
      <Card>
        <CardContent className="py-5">
          <p className="mb-3 font-medium">{t('billing.comparePlans')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium" scope="col">
                    &nbsp;
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan}
                      scope="col"
                      className={cn(
                        'px-3 py-2 text-center font-medium',
                        // The reader's own column, carried down every row so the
                        // comparison is anchored to where they actually are.
                        plan === currentPlan && 'bg-primary/5 text-primary'
                      )}
                    >
                      {t(PLAN_NAME[plan])}
                      {plan === currentPlan ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {t('billing.currentPlanBadge')}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LIMIT_ROWS.map((row) => (
                  <tr key={row.resource} className="border-b border-border/50">
                    <th
                      scope="row"
                      className="sticky left-0 bg-background py-2 pr-4 text-left font-normal"
                    >
                      {t(row.labelKey)}
                    </th>
                    {PLANS.map((plan) => (
                      <td
                        key={plan}
                        className={cn(
                          'px-3 py-2 text-center text-xs font-medium',
                          plan === currentPlan && 'bg-primary/5'
                        )}
                      >
                        {limitLabel(plan, row.resource, row.monthly)}
                      </td>
                    ))}
                  </tr>
                ))}

                {TICK_ROWS.map((capability) => (
                  <tr key={capability.id} className="border-b border-border/50 last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 bg-background py-2 pr-4 text-left font-normal"
                    >
                      {t(capability.labelKey)}
                      {capability.status === 'planned' ? (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {t('billing.planned')}
                        </Badge>
                      ) : null}
                    </th>
                    {PLANS.map((plan) => {
                      // A planned capability shows a clock, never a tick: the
                      // plan covers it, the product does not do it yet.
                      const delivered = planDelivers(plan, capability);
                      const covered = planIncludes(plan, capability);
                      return (
                        <td
                          key={plan}
                          className={cn(
                            'px-3 py-2 text-center',
                            plan === currentPlan && 'bg-primary/5'
                          )}
                        >
                          {delivered ? (
                            <Check
                              className="mx-auto h-4 w-4 text-primary"
                              aria-label={t('billing.included')}
                            />
                          ) : covered ? (
                            <Clock
                              className="mx-auto h-4 w-4 text-muted-foreground"
                              aria-label={t('billing.planned')}
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 text-muted-foreground/50"
                              aria-label={t('billing.notIncluded')}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

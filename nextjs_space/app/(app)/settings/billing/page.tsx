import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/db';
import { getUserCompanyId } from '@/lib/auth-helpers';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, intlLocale, type Locale, type TranslationKey } from '@/lib/i18n';
import { billingState, currentPlan, daysRemaining } from '@/lib/billing/access';
import { isBillingConfigured } from '@/lib/billing/plans';
import { yearlySaving } from '@/lib/billing/pricing';
import { getPlanPricing } from '@/lib/billing/pricing-server';
import { PlanSelector } from '@/components/billing-plans';
import { formatCurrency } from '@/lib/currencies';
import { BillingActions, CheckoutReturnNotice } from '@/components/billing-actions';

/**
 * Subscription & Billing.
 *
 * A server component on purpose. The subscription is read directly from the
 * database using the company resolved from the session, so there is no client
 * fetch to secure, no companyId travelling over the wire, and no Polar
 * identifier a client could use to look up someone else's subscription.
 *
 * Everything on this page comes from the Subscription row or is a static
 * label. Nothing is invented: no placeholder price, no sample invoice, no
 * fabricated renewal date. A company with no row is simply on the Free plan.
 */
export const dynamic = 'force-dynamic';

/** Long date in the reader's language. Subscription periods are real instants. */
function formatDate(value: Date | null | undefined, locale: Locale): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

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

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { checkout?: string };
}) {
  // companyId comes from the session, never from a request parameter. Without a
  // company the user has not finished onboarding.
  const companyId = await getUserCompanyId();
  if (!companyId) redirect('/onboarding');

  /**
   * Reading the subscription must not be able to take the page down.
   *
   * This is the only screen that touches the Subscription table, so it is the
   * only one that fails when that table is missing — a deployment where the
   * code shipped but `prisma migrate deploy` has not run yet. Without this
   * guard the thrown error escapes the server component and, with no error
   * boundary above it, Next.js replaces the whole route with the generic
   * "Application error" screen.
   *
   * A billing read failing is worth an explanatory panel, not a blank page.
   */
  let subscription: Awaited<ReturnType<typeof prisma.subscription.findUnique>> = null;
  let loadFailed = false;
  try {
    subscription = await prisma.subscription.findUnique({ where: { companyId } });
  } catch (error) {
    // The Prisma code is logged; nothing about the database reaches the client.
    console.error('[billing:page] could not read subscription', {
      code: (error as { code?: string })?.code,
    });
    loadFailed = true;
  }

  /**
   * Prices are read from Polar rather than written here: the environment holds
   * product ids, so a figure in source could diverge from what is charged.
   * getPlanPricing absorbs failures and returns no prices, and the cards then
   * render without figures rather than inventing one.
   */
  const pricing = await getPlanPricing();
  const savings = {
    pro: yearlySaving(pricing.prices.pro.month, pricing.prices.pro.year),
    business: yearlySaving(pricing.prices.business.month, pricing.prices.business.year),
  };

  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  const plan = currentPlan(subscription);
  const state = billingState(subscription);
  const remaining = daysRemaining(subscription);

  /**
   * Whether the actions on this page can do anything.
   *
   * Checkout and the customer portal are separate endpoints that do not exist
   * yet. Until they do, the buttons are disabled and the page says why —
   * a control that looks live but silently does nothing is worse than one that
   * is plainly not ready.
   */
  const actionsAvailable = isBillingConfigured();

  /**
   * The sections below test `subscription` itself rather than a derived boolean.
   *
   * Narrowing through an alias depends on how the compiler analyses it; testing
   * the value directly does not. Behaviour is unchanged: inside the block below
   * the read has already succeeded, so "no row" and "the Free plan" are the same
   * state. A failed read never reaches it — the panel above renders instead, so
   * a paying customer is never shown "Free" because a query happened to fail.
   */

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('billing.title')}</h1>
        <p className="text-muted-foreground">{t('billing.subtitle')}</p>
      </div>

      {searchParams?.checkout === 'success' ? <CheckoutReturnNotice /> : null}

      {loadFailed ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm font-medium">{t('billing.loadFailed')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('billing.loadFailedNote')}</p>
          </CardContent>
        </Card>
      ) : null}

      {!actionsAvailable ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-4">
            <p className="text-sm font-medium">{t('billing.notConfigured')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('billing.notConfiguredNote')}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Current plan */}
      {!loadFailed ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('billing.currentPlan')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl font-bold">{t(PLAN_LABEL[plan])}</span>
            {subscription ? (
              <Badge variant={state === 'past_due' || state === 'expired' ? 'destructive' : 'secondary'}>
                {t(STATE_LABEL[state])}
              </Badge>
            ) : null}
          </div>

          {!subscription ? (
            <>
              <p className="text-sm text-muted-foreground">{t('billing.freeDescription')}</p>
              <BillingActions enabled={actionsAvailable} showUpgrade />
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">{t('billing.amount')}</p>
                <p className="font-mono text-lg font-bold">
                  {formatCurrency(Number(subscription.amount), subscription.currency)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    /{' '}
                    {subscription.interval === 'year'
                      ? t('billing.yearly')
                      : t('billing.monthly')}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {/* A cancelled subscription is not renewing, so calling this a
                      renewal date would be wrong. */}
                  {state === 'canceling' || state === 'expired'
                    ? t('billing.endsOn')
                    : t('billing.renewalDate')}
                </p>
                <p className="font-medium">{formatDate(subscription.currentPeriodEnd, locale)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      ) : null}

      {/* Plans and limits. Hidden while the subscription read failed: inviting
          someone to upgrade from a page that could not establish what they are
          already on would be worse than showing nothing. */}
      {!loadFailed ? (
        <PlanSelector
          currentPlan={plan}
          prices={pricing.prices}
          savings={savings}
          actionsAvailable={actionsAvailable}
        />
      ) : null}

      {/* Subscription detail — only when there is a real row to describe. */}
      {subscription ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.subscription')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state === 'past_due' ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {t('billing.pastDueNote')}
              </p>
            ) : null}
            {state === 'canceling' ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('billing.cancelingNote')}
              </p>
            ) : null}

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t('billing.status')}</dt>
                <dd className="font-medium">{t(STATE_LABEL[state])}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('billing.billingCycle')}</dt>
                <dd className="font-medium">
                  {subscription.interval === 'year' ? t('billing.yearly') : t('billing.monthly')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('billing.periodStart')}</dt>
                <dd className="font-medium">
                  {formatDate(subscription.currentPeriodStart, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {state === 'canceling' || state === 'expired'
                    ? t('billing.endsOn')
                    : t('billing.renewalDate')}
                </dt>
                <dd className="font-medium">
                  {formatDate(subscription.currentPeriodEnd, locale)}
                  {remaining !== null && remaining > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">({remaining}d)</span>
                  ) : null}
                </dd>
              </div>
              {subscription.trialEndsAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('billing.trialEnds')}</dt>
                  <dd className="font-medium">{formatDate(subscription.trialEndsAt, locale)}</dd>
                </div>
              ) : null}
              {subscription.canceledAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('billing.canceledOn')}</dt>
                  <dd className="font-medium">{formatDate(subscription.canceledAt, locale)}</dd>
                </div>
              ) : null}
            </dl>

          <BillingActions enabled={actionsAvailable} showUpgrade={false} variant="subscription" />
          </CardContent>
        </Card>
      ) : null}

      {/* Payment method — always handled by Polar, never by this application. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('billing.payment')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('billing.paymentNote')}</p>
          <BillingActions enabled={actionsAvailable} showUpgrade={false} variant="payment" />
        </CardContent>
      </Card>

      {/* Billing history lives in Polar's portal; it is not mirrored here. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('billing.history')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('billing.historyNote')}</p>
          <BillingActions enabled={actionsAvailable} showUpgrade={false} variant="history" />
        </CardContent>
      </Card>
    </div>
  );
}

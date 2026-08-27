'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
import type { TranslationKey } from '@/lib/i18n';

/**
 * The buttons on the billing page.
 *
 * Split out as a client component so the page itself stays a server component
 * reading the subscription straight from the database. Only the interaction
 * lives here — no subscription data is fetched into the browser to render it.
 *
 * Every destination comes from the server: the routes return a Polar URL and
 * this navigates to it. A URL is never taken from anywhere else, and no plan
 * price or provider id is present in this file.
 */

type Action = 'checkout-pro' | 'checkout-business' | 'portal';

export function BillingActions({
  /** False while the deployment has no Polar configuration. */
  enabled,
  /** Show upgrade buttons (Free) rather than manage buttons. */
  showUpgrade,
  /** Which manage button this instance renders. */
  variant,
  onlyPlan,
  interval = 'month',
}: {
  enabled: boolean;
  showUpgrade: boolean;
  variant?: 'subscription' | 'payment' | 'history';
  /** Render a single upgrade button for this plan instead of both. */
  onlyPlan?: 'pro' | 'business';
  /**
   * Interval to buy. Sent to the checkout route, which resolves the Polar
   * product id from plan + interval server-side - the client never names a
   * price, so the figure on screen is the one that gets charged.
   */
  interval?: 'month' | 'year';
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);

  /** Posts to a billing route and follows the URL it returns. */
  const go = async (action: Action, endpoint: string, body?: unknown) => {
    setBusy(action);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }

      const data = await res.json();
      if (typeof data?.url !== 'string') {
        toast.error(t('billing.actionFailed'));
        return;
      }

      // Leaving the application entirely, so a full navigation rather than the
      // router: Polar owns the next page.
      window.location.href = data.url;
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  const label = (key: TranslationKey, action: Action) =>
    busy === action ? t('common.loading') : t(key);

  if (showUpgrade) {
    const upgrade = (plan: 'pro' | 'business') => (
      <Button
        key={plan}
        variant={plan === 'business' ? 'outline' : 'default'}
        className="w-full"
        disabled={!enabled || busy !== null}
        onClick={() =>
          go(
            plan === 'pro' ? 'checkout-pro' : 'checkout-business',
            '/api/billing/checkout',
            { plan, interval }
          )
        }
      >
        {label(
          plan === 'pro' ? 'billing.upgradePro' : 'billing.upgradeBusiness',
          plan === 'pro' ? 'checkout-pro' : 'checkout-business'
        )}
      </Button>
    );

    if (onlyPlan) return upgrade(onlyPlan);
    return <div className="flex flex-wrap gap-2">{upgrade('pro')}{upgrade('business')}</div>;
  }

  const manageLabel: TranslationKey =
    variant === 'payment'
      ? 'billing.managePaymentMethod'
      : variant === 'history'
        ? 'billing.viewHistory'
        : 'billing.manageSubscription';

  return (
    <Button
      variant="outline"
      disabled={!enabled || busy !== null}
      onClick={() => go('portal', '/api/billing/portal')}
    >
      {label(manageLabel, 'portal')}
    </Button>
  );
}

/**
 * Refreshes server-rendered subscription data after returning from checkout.
 *
 * Polar sends the browser back before its webhook necessarily arrives, so the
 * first render can still show the old plan. `router.refresh()` re-runs the
 * server component; the message tells the user why it might lag.
 */
export function CheckoutReturnNotice() {
  const { t } = useI18n();
  const router = useRouter();
  const [refreshed, setRefreshed] = useState(false);

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <p>{t('billing.checkoutReturn')}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-7 px-2"
        disabled={refreshed}
        onClick={() => {
          setRefreshed(true);
          router.refresh();
        }}
      >
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
import { formatCurrency } from '@/lib/currencies';
import { track, flushTracking } from '@/lib/tracking/events';
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
  price = null,
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
  /** The price on the card, used only as the value of the begin_checkout event. */
  price?: { amount: number; currency: string } | null;
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

      if (action !== 'portal') {
        // Reported only once Polar has accepted the checkout, and given a
        // moment to leave before the page does. track() checks consent itself.
        track({
          name: 'begin_checkout',
          plan: action === 'checkout-pro' ? 'pro' : 'business',
          interval,
          value: price?.amount ?? null,
          currency: price?.currency ?? null,
        });
        await flushTracking();
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
 * Shown on return from Polar's checkout.
 *
 * Two jobs. It refreshes the server-rendered subscription (Polar sends the
 * browser back before its webhook necessarily arrives), and it reports the
 * purchase conversion - but only after /api/billing/checkout/status has asked
 * Polar and Polar says the checkout `succeeded`. The id in the URL alone
 * proves nothing. `track()` counts a transaction id once per browser, and the
 * tools de-duplicate on the same id, so a reload does not add a second sale.
 */
export function CheckoutReturnNotice({ checkoutId }: { checkoutId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [refreshed, setRefreshed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!checkoutId || started.current) return;
    started.current = true;
    let cancelled = false;

    const check = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch(`/api/billing/checkout/status?id=${encodeURIComponent(checkoutId)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.status === 'succeeded') {
          track({
            name: 'purchase',
            transactionId: String(data.transactionId),
            plan: data.plan === 'pro' || data.plan === 'business' ? data.plan : null,
            interval: data.interval === 'year' ? 'year' : data.interval === 'month' ? 'month' : null,
            value: Number(data.value),
            currency: String(data.currency),
          });
          router.refresh();
          return;
        }
        // Still processing: ask again a few times, then stop.
        if (data?.status === 'confirmed' && attempt < 6 && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return check(attempt + 1);
        }
      } catch {
        // The notice and the manual refresh below still work.
      }
    };
    void check(0);
    return () => {
      cancelled = true;
    };
  }, [checkoutId, router]);

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

interface PlanChangePreview {
  direction: 'upgrade' | 'downgrade';
  currency: string;
  estimate: number | null;
  effectiveAt: string;
}

/**
 * Moves an existing subscription to another paid plan.
 *
 * Used instead of checkout whenever the company already pays: a second
 * checkout would be refused by Polar ("You already have an active
 * subscription"). Opens a confirmation first - the new plan and, for an
 * upgrade, an estimate of today's prorated charge - and only the button in
 * that dialog changes anything.
 */
export function PlanChangeButton({ plan, enabled }: { plan: 'pro' | 'business'; enabled: boolean }) {
  const { t, intl } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isUpgrade = plan === 'business';
  const planName = t(plan === 'pro' ? 'billing.planPro' : 'billing.planBusiness');
  const fill = (key: TranslationKey, values: Record<string, string>) =>
    Object.entries(values).reduce<string>((text, [k, v]) => text.replace(`{${k}}`, v), t(key));
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(intl, { dateStyle: 'long' });

  const post = (confirm: boolean) =>
    fetch('/api/billing/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, confirm }),
    });

  const openDialog = async () => {
    setLoading(true);
    try {
      const res = await post(false);
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      setPreview((await res.json()) as PlanChangePreview);
      setOpen(true);
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  const confirmChange = async () => {
    setSubmitting(true);
    try {
      const res = await post(true);
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      const data = await res.json();
      if (data?.status === 'upgraded') {
        if (data.charged) {
          track({
            name: 'plan_upgrade',
            transactionId: String(data.charged.orderId),
            plan,
            value: Number(data.charged.amount),
            currency: String(data.charged.currency),
          });
          toast.success(
            fill('billing.change.doneUpgradeCharged', {
              plan: planName,
              amount: formatCurrency(data.charged.amount, data.charged.currency),
            })
          );
        } else {
          toast.success(fill('billing.change.doneUpgrade', { plan: planName }));
        }
      } else if (data?.status === 'scheduled') {
        toast.success(fill('billing.change.doneScheduled', { plan: planName, date: dateLabel(data.effectiveAt) }));
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant={isUpgrade ? 'default' : 'outline'}
        className="w-full"
        disabled={!enabled || loading}
        onClick={openDialog}
      >
        {loading ? t('common.loading') : t(isUpgrade ? 'billing.upgradeBusiness' : 'billing.change.switchToPro')}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
        <DialogContent>
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {fill(
                    preview.direction === 'upgrade' ? 'billing.change.titleUpgrade' : 'billing.change.titleDowngrade',
                    { plan: planName }
                  )}
                </DialogTitle>
                <DialogDescription>
                  {preview.direction === 'upgrade'
                    ? t('billing.change.upgradeNote')
                    : fill('billing.change.downgradeNote', { plan: planName, date: dateLabel(preview.effectiveAt) })}
                </DialogDescription>
              </DialogHeader>

              <dl className="space-y-3 text-base">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t('billing.change.newPlan')}</dt>
                  <dd className="font-semibold">{planName}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {t(preview.direction === 'upgrade' ? 'billing.change.dueToday' : 'billing.change.dueTodayNone')}
                  </dt>
                  <dd className="font-mono font-semibold">
                    {preview.direction === 'downgrade'
                      ? formatCurrency(0, preview.currency || 'USD')
                      : preview.estimate !== null
                        ? formatCurrency(preview.estimate, preview.currency)
                        : t('billing.change.estimateUnavailable')}
                  </dd>
                </div>
              </dl>
              {preview.direction === 'upgrade' ? (
                <p className="text-sm text-muted-foreground">{t('billing.change.estimateNote')}</p>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button size="lg" disabled={submitting} onClick={confirmChange}>
                  {submitting
                    ? t('common.loading')
                    : t(
                        preview.direction === 'upgrade'
                          ? 'billing.change.confirmUpgrade'
                          : 'billing.change.confirmDowngrade'
                      )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

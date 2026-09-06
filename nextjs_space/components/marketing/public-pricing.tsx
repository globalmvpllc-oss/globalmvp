import Link from 'next/link';
import { getPlanPricing } from '@/lib/billing/pricing-server';
import { yearlySaving } from '@/lib/billing/pricing';
import { PlanSelector } from '@/components/billing-plans';
import { Container } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Prices and the plan comparison, on the public pages.
 *
 * Everything here is the existing billing implementation, reused rather than
 * restated: the figures come from Polar through getPlanPricing, and the cards
 * and comparison table are the same PlanSelector the account uses. There is no
 * second copy of a price to drift out of date.
 *
 * Two things differ from the account view:
 *
 *   - `currentPlan` is 'free', because a visitor has no subscription. That is
 *     what the free tier is: the absence of one. `showCurrentPlan` is false so
 *     that this is not announced as a Current plan badge: technically true of
 *     the account model, but read by someone who has never signed up it says
 *     they are already on a plan, which they are not.
 *   - `actionsAvailable` is false, so no checkout button is rendered: a visitor
 *     is not signed in and cannot be charged. `signupCta` then makes each paid
 *     card's action a link into signup carrying that plan and the chosen
 *     interval, which signup, onboarding and Settings › Billing hand on until
 *     the reader is standing in front of the plan they picked. Before that flag
 *     existed the card rendered a disabled button, so someone who had read the
 *     prices and decided to buy pressed Upgrade and nothing happened.
 *
 * The cards omit capabilities marked Planned. Someone deciding what to pay for
 * should see what works today; the planned ones remain in the comparison table
 * with their badge and the explanatory note beneath it.
 *
 * Prices are read at request time. getPlanPricing swallows its own failures and
 * returns nothing, in which case the plans render without figures rather than
 * taking the page down.
 */
export async function PublicPricing({ id = 'pricing' }: { id?: string }) {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  const pricing = await getPlanPricing();
  const savings = {
    pro: yearlySaving(pricing.prices.pro.month, pricing.prices.pro.year),
    business: yearlySaving(pricing.prices.business.month, pricing.prices.business.year),
  };

  return (
    <section id={id} className="border-b border-border py-20 sm:py-28" aria-labelledby="public-pricing-heading">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {t('landing.pricingTeaser.eyebrow')}
          </p>
          <h2
            id="public-pricing-heading"
            className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            {t('landing.pricingTeaser.title')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('landing.pricingTeaser.description')}
          </p>
        </div>

        <div className="mt-12">
          <PlanSelector
            currentPlan="free"
            prices={pricing.prices}
            savings={savings}
            actionsAvailable={false}
            plannedInCards={false}
            showCurrentPlan={false}
            signupCta
          />
        </div>

        {/* Requested trust line. Deliberately not a billing control: managing a
            payment method and viewing invoices require a session and live in
            Settings › Billing, where a customer can actually use them. */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t('landing.pricing.trustLine')}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/signup"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
          >
            {t('landing.cta.startFree')}
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border px-6 text-base font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
          >
            {t('landing.pricing.questionsCta')}
          </Link>
        </div>
      </Container>
    </section>
  );
}

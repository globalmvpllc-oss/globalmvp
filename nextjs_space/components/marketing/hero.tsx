import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/section';
import { DashboardPreview } from '@/components/marketing/dashboard-preview';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

const TRUST_POINTS: TranslationKey[] = [
  'landing.hero.trustNoBank',
  'landing.hero.trustSetup',
  'landing.hero.trustCurrencies',
];

export function Hero() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Restrained ambient wash — one soft tint, no gradient stack */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <Container className="relative">
        <div className="py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {t('landing.hero.eyebrow')}
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t('landing.hero.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {t('landing.hero.subtitle')}
            </p>

            {/*
              The offer, stated once and plainly. Display face and semibold so it
              outweighs the sub-headline above it, but a step down in size from
              the h1 so it still reads as support for the headline rather than a
              second one.

              This line is only true because of two constants: "3 customers" is
              PLAN_LIMITS.free.customers (lib/billing/features.ts) and "15 days"
              is TRIAL_DAYS (lib/billing/trial.ts). If either changes, change the
              copy (EN and TR) to match — the claim must stay accurate.

              Two spans rather than one sentence: the break between the offer's
              two halves is deliberate, so it falls in the same place at every
              width instead of wherever the line happens to run out.
            */}
            <p className="mx-auto mt-5 max-w-2xl text-center font-display text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
              <span className="block">{t('landing.heroTagline')}</span>
              <span className="block">{t('landing.heroTaglineTrial')}</span>
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/auth/signup">
                  {t('landing.cta.startFree')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/#how-it-works">{t('landing.cta.seeHowItWorks')}</Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-col items-center justify-center gap-x-6 gap-y-2 sm:flex-row">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  {t(point)}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto mt-14 max-w-4xl sm:mt-16">
            <DashboardPreview />
          </div>
        </div>
      </Container>
    </section>
  );
}

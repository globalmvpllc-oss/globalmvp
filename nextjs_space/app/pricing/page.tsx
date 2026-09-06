import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';
import { PublicPricing } from '@/components/marketing/public-pricing';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

// Metadata stays in English: it is read by crawlers, which carry no locale
// cookie, and the canonical URL is one document rather than one per language.
export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'CorpControl pricing. Start free and manage invoices, expenses and payments for your small business.',
  alternates: { canonical: '/pricing' },
};


export default function PricingPage() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                {t('pricingPage.eyebrow')}
              </p>
              <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                {t('pricingPage.title')}
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                {t('pricingPage.subtitle')}
              </p>
            </div>

          </Container>
        </section>

        {/* Real plans and prices, read from Polar through the same component the
            account uses. The static single-card summary that stood here could
            not show a figure and had to be kept in step with Polar by hand. */}
        <PublicPricing id="plans" />



        <section className="py-16 sm:py-20" aria-labelledby="pricing-cta-heading">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="pricing-cta-heading"
                className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                {t('pricingPage.ctaTitle')}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t('pricingPage.ctaBody')}
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/auth/signup">
                    {t('landing.cta.startFree')}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/#faq">{t('landing.cta.readFaq')}</Link>
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

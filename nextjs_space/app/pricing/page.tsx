import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';
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

const INCLUDED: TranslationKey[] = [
  'pricingPage.f1',
  'pricingPage.f2',
  'pricingPage.f3',
  'pricingPage.f4',
  'pricingPage.f5',
  'pricingPage.f6',
  'pricingPage.f7',
];

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

            <div className="mx-auto mt-14 max-w-xl">
              <div className="rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  {t('pricingPage.cardEyebrow')}
                </p>
                <h2 className="mt-3 font-display text-2xl font-bold text-foreground">
                  {t('pricingPage.cardTitle')}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t('pricingPage.cardBody')}
                </p>

                <ul className="mt-8 space-y-3">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-foreground">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {t(item)}
                    </li>
                  ))}
                </ul>

                <Button asChild size="lg" className="mt-8 w-full">
                  <Link href="/auth/signup">
                    {t('landing.cta.startFree')}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {t('pricingPage.noBankNote')}
                </p>
              </div>

              <p className="mt-8 text-center text-sm text-muted-foreground">
                {t('pricingPage.questionLead')}
                <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {t('pricingPage.questionLink')}
                </Link>
                {t('pricingPage.questionTail')}
              </p>
            </div>
          </Container>
        </section>

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

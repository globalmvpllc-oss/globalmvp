import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

export function PricingTeaser() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section id="pricing" className="border-b border-border" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
        <SectionHeading
          id="pricing-heading"
          eyebrow={t('landing.pricingTeaser.eyebrow')}
          title={t('landing.pricingTeaser.title')}
          description={t('landing.pricingTeaser.description')}
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/auth/signup">
              {t('landing.cta.startFree')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/pricing">{t('landing.cta.seePlans')}</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

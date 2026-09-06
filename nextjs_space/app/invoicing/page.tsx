import type { Metadata } from 'next';
import { CalendarClock, CircleDollarSign, Palette } from 'lucide-react';
import { AcquisitionLanding } from '@/components/marketing/acquisition-landing';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Search-acquisition landing page for the invoicing keyword group.
 *
 * A dedicated page per ad group rather than pointing every ad at the home page:
 * the heading answers the search the visitor actually made, which is both what
 * Google's landing page experience rewards and what stops a visitor bouncing
 * because the page talks about something adjacent to what they typed.
 *
 * Every capability listed here is one the product ships today. Nothing marked
 * planned appears on this page.
 */

const locale = getServerLocale;

export const metadata: Metadata = {
  title: translate('en', 'landing.invoicing.metaTitle'),
  description: translate('en', 'landing.invoicing.metaDescription'),
  alternates: { canonical: '/invoicing' },
  openGraph: {
    title: translate('en', 'landing.invoicing.metaTitle'),
    description: translate('en', 'landing.invoicing.metaDescription'),
    url: '/invoicing',
  },
};

export default function InvoicingPage() {
  const active = locale();
  const t = (key: TranslationKey) => translate(active, key);

  return (
    <AcquisitionLanding
      eyebrow={t('landing.invoicing.eyebrow')}
      title={t('landing.invoicing.title')}
      subtitle={t('landing.invoicing.subtitle')}
      heroPoints={[
        t('landing.invoicing.point1'),
        t('landing.invoicing.point2'),
        t('landing.invoicing.point3'),
      ]}
      primaryCta={t('landing.cta.startFree')}
      secondaryCta={t('landing.shared.seeHowItWorks')}
      secondaryCtaHref="/#how-it-works"
      benefitsEyebrow={t('landing.invoicing.benefitsEyebrow')}
      benefitsTitle={t('landing.invoicing.benefitsTitle')}
      benefits={[
        { icon: CalendarClock, title: t('landing.invoicing.benefit1Title'), body: t('landing.invoicing.benefit1Body') },
        { icon: CircleDollarSign, title: t('landing.invoicing.benefit2Title'), body: t('landing.invoicing.benefit2Body') },
        { icon: Palette, title: t('landing.invoicing.benefit3Title'), body: t('landing.invoicing.benefit3Body') },
      ]}
      stepsEyebrow={t('landing.shared.stepsEyebrow')}
      stepsTitle={t('landing.shared.stepsTitle')}
      steps={[
        { number: '01', title: t('landing.shared.step1Title'), body: t('landing.shared.step1Body') },
        { number: '02', title: t('landing.shared.step2Title'), body: t('landing.shared.step2Body') },
        { number: '03', title: t('landing.invoicing.step3Title'), body: t('landing.invoicing.step3Body') },
      ]}
      featuresTitle={t('landing.invoicing.featuresTitle')}
      features={[
        t('landing.invoicing.feature1'),
        t('landing.invoicing.feature2'),
        t('landing.invoicing.feature3'),
        t('landing.invoicing.feature4'),
        t('landing.invoicing.feature5'),
        t('landing.invoicing.feature6'),
      ]}
      closingTitle={t('landing.invoicing.closingTitle')}
      closingBody={t('landing.invoicing.closingBody')}
      pricingCta={t('landing.shared.seePricing')}
    />
  );
}

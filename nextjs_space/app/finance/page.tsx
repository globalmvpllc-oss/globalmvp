import type { Metadata } from 'next';
import { Wallet, LineChart, Sparkles } from 'lucide-react';
import { AcquisitionLanding } from '@/components/marketing/acquisition-landing';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Search-acquisition landing page for the finance keyword group.
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
  title: translate('en', 'landing.finance.metaTitle'),
  description: translate('en', 'landing.finance.metaDescription'),
  alternates: { canonical: '/finance' },
  openGraph: {
    title: translate('en', 'landing.finance.metaTitle'),
    description: translate('en', 'landing.finance.metaDescription'),
    url: '/finance',
  },
};

export default function FinancePage() {
  const active = locale();
  const t = (key: TranslationKey) => translate(active, key);

  return (
    <AcquisitionLanding
      eyebrow={t('landing.finance.eyebrow')}
      title={t('landing.finance.title')}
      subtitle={t('landing.finance.subtitle')}
      heroPoints={[
        t('landing.finance.point1'),
        t('landing.finance.point2'),
        t('landing.finance.point3'),
      ]}
      primaryCta={t('landing.cta.startFree')}
      secondaryCta={t('landing.shared.seeHowItWorks')}
      secondaryCtaHref="/#how-it-works"
      benefitsEyebrow={t('landing.finance.benefitsEyebrow')}
      benefitsTitle={t('landing.finance.benefitsTitle')}
      benefits={[
        { icon: Wallet, title: t('landing.finance.benefit1Title'), body: t('landing.finance.benefit1Body') },
        { icon: LineChart, title: t('landing.finance.benefit2Title'), body: t('landing.finance.benefit2Body') },
        { icon: Sparkles, title: t('landing.finance.benefit3Title'), body: t('landing.finance.benefit3Body') },
      ]}
      stepsEyebrow={t('landing.shared.stepsEyebrow')}
      stepsTitle={t('landing.shared.stepsTitle')}
      steps={[
        { number: '01', title: t('landing.shared.step1Title'), body: t('landing.shared.step1Body') },
        { number: '02', title: t('landing.shared.step2Title'), body: t('landing.shared.step2Body') },
        { number: '03', title: t('landing.finance.step3Title'), body: t('landing.finance.step3Body') },
      ]}
      featuresTitle={t('landing.finance.featuresTitle')}
      features={[
        t('landing.finance.feature1'),
        t('landing.finance.feature2'),
        t('landing.finance.feature3'),
        t('landing.finance.feature4'),
        t('landing.finance.feature5'),
        t('landing.finance.feature6'),
      ]}
      closingTitle={t('landing.finance.closingTitle')}
      closingBody={t('landing.finance.closingBody')}
      pricingCta={t('landing.shared.seePricing')}
    />
  );
}

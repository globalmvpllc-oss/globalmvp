import type { Metadata } from 'next';
import { Receipt, BellRing, PieChart } from 'lucide-react';
import { AcquisitionLanding } from '@/components/marketing/acquisition-landing';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Search-acquisition landing page for the expense-tracking keyword group.
 *
 * The route is /expense-tracking rather than /expenses because the signed-in
 * application already owns /expenses, and two pages cannot resolve to one path.
 * It reads better as an ad destination anyway: "expense tracking software" is
 * the phrase people search, and the URL now matches it.
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
  title: translate('en', 'landing.expenses.metaTitle'),
  description: translate('en', 'landing.expenses.metaDescription'),
  alternates: { canonical: '/expense-tracking' },
  openGraph: {
    title: translate('en', 'landing.expenses.metaTitle'),
    description: translate('en', 'landing.expenses.metaDescription'),
    url: '/expense-tracking',
  },
};

export default function ExpenseTrackingPage() {
  const active = locale();
  const t = (key: TranslationKey) => translate(active, key);

  return (
    <AcquisitionLanding
      eyebrow={t('landing.expenses.eyebrow')}
      title={t('landing.expenses.title')}
      subtitle={t('landing.expenses.subtitle')}
      heroPoints={[
        t('landing.expenses.point1'),
        t('landing.expenses.point2'),
        t('landing.expenses.point3'),
      ]}
      primaryCta={t('landing.cta.startFree')}
      secondaryCta={t('landing.shared.seeHowItWorks')}
      secondaryCtaHref="/#how-it-works"
      benefitsEyebrow={t('landing.expenses.benefitsEyebrow')}
      benefitsTitle={t('landing.expenses.benefitsTitle')}
      benefits={[
        { icon: Receipt, title: t('landing.expenses.benefit1Title'), body: t('landing.expenses.benefit1Body') },
        { icon: BellRing, title: t('landing.expenses.benefit2Title'), body: t('landing.expenses.benefit2Body') },
        { icon: PieChart, title: t('landing.expenses.benefit3Title'), body: t('landing.expenses.benefit3Body') },
      ]}
      stepsEyebrow={t('landing.shared.stepsEyebrow')}
      stepsTitle={t('landing.shared.stepsTitle')}
      steps={[
        { number: '01', title: t('landing.shared.step1Title'), body: t('landing.shared.step1Body') },
        { number: '02', title: t('landing.shared.step2Title'), body: t('landing.shared.step2Body') },
        { number: '03', title: t('landing.expenses.step3Title'), body: t('landing.expenses.step3Body') },
      ]}
      featuresTitle={t('landing.expenses.featuresTitle')}
      features={[
        t('landing.expenses.feature1'),
        t('landing.expenses.feature2'),
        t('landing.expenses.feature3'),
        t('landing.expenses.feature4'),
        t('landing.expenses.feature5'),
        t('landing.expenses.feature6'),
      ]}
      closingTitle={t('landing.expenses.closingTitle')}
      closingBody={t('landing.expenses.closingBody')}
      pricingCta={t('landing.shared.seePricing')}
    />
  );
}

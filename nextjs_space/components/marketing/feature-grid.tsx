import { BarChart3, CalendarDays, FileText, Receipt, Users, Wallet } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

const FEATURES: Array<{ icon: typeof FileText; title: TranslationKey; body: TranslationKey }> = [
  { icon: FileText, title: 'landing.features.invoicesTitle', body: 'landing.features.invoicesBody' },
  { icon: Users, title: 'landing.features.customersTitle', body: 'landing.features.customersBody' },
  { icon: Receipt, title: 'landing.features.moneyTitle', body: 'landing.features.moneyBody' },
  { icon: Wallet, title: 'landing.features.paymentsTitle', body: 'landing.features.paymentsBody' },
  { icon: CalendarDays, title: 'landing.features.calendarTitle', body: 'landing.features.calendarBody' },
  { icon: BarChart3, title: 'landing.features.reportsTitle', body: 'landing.features.reportsBody' },
];

export function FeatureGrid() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section id="features" className="border-b border-border" aria-labelledby="features-heading">
      <SectionHeading
        id="features-heading"
        eyebrow={t('landing.features.eyebrow')}
        title={t('landing.features.title')}
        description={t('landing.features.description')}
      />

      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="group rounded-xl border border-border bg-card p-6 transition-all duration-normal hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
          >
            <span className="inline-grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-colors duration-normal group-hover:bg-primary/15">
              <feature.icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{t(feature.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(feature.body)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

const BENEFITS: Array<{ title: TranslationKey; body: TranslationKey }> = [
  { title: 'landing.benefits.b1Title', body: 'landing.benefits.b1Body' },
  { title: 'landing.benefits.b2Title', body: 'landing.benefits.b2Body' },
  { title: 'landing.benefits.b3Title', body: 'landing.benefits.b3Body' },
  { title: 'landing.benefits.b4Title', body: 'landing.benefits.b4Body' },
];

export function Benefits() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section className="border-b border-border" aria-labelledby="benefits-heading">
      <SectionHeading
        id="benefits-heading"
        eyebrow={t('landing.benefits.eyebrow')}
        title={t('landing.benefits.title')}
      />

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="border-l-2 border-primary/25 pl-5">
            <h3 className="font-display text-lg font-semibold text-foreground">{t(benefit.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(benefit.body)}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

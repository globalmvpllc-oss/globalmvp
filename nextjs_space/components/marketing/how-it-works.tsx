import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Numbered because this genuinely is a sequence — each step depends on the
 * one before it. The onboarding flow enforces the same order.
 */
const STEPS: Array<{ number: string; title: TranslationKey; body: TranslationKey }> = [
  { number: '01', title: 'landing.how.step1Title', body: 'landing.how.step1Body' },
  { number: '02', title: 'landing.how.step2Title', body: 'landing.how.step2Body' },
  { number: '03', title: 'landing.how.step3Title', body: 'landing.how.step3Body' },
];

export function HowItWorks() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section id="how-it-works" className="border-b border-border bg-muted/30" aria-labelledby="how-heading">
      <SectionHeading
        id="how-heading"
        eyebrow={t('landing.how.eyebrow')}
        title={t('landing.how.title')}
        description={t('landing.how.description')}
      />

      <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step) => (
          <li key={step.number} className="relative border-t-2 border-primary/20 pt-6">
            <span className="font-mono text-sm font-semibold tracking-[0.16em] text-primary">
              {step.number}
            </span>
            <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{t(step.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(step.body)}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex justify-center">
        <Button asChild size="lg">
          <Link href="/auth/signup">{t('landing.cta.startFree')}</Link>
        </Button>
      </div>
    </Section>
  );
}

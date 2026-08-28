import { ArrowRight } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

const PROBLEMS: Array<{ problem: TranslationKey; solution: TranslationKey }> = [
  { problem: 'landing.problem.p1', solution: 'landing.problem.s1' },
  { problem: 'landing.problem.p2', solution: 'landing.problem.s2' },
  { problem: 'landing.problem.p3', solution: 'landing.problem.s3' },
  { problem: 'landing.problem.p4', solution: 'landing.problem.s4' },
];

export function ProblemSolution() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section className="border-b border-border" aria-labelledby="problem-heading">
      <SectionHeading
        id="problem-heading"
        eyebrow={t('landing.problem.eyebrow')}
        title={t('landing.problem.title')}
        description={t('landing.problem.description')}
      />

      <ul className="mx-auto mt-14 max-w-3xl divide-y divide-border border-y border-border">
        {PROBLEMS.map((item) => (
          <li key={item.problem} className="grid gap-2 py-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6">
            <p className="text-base text-muted-foreground line-through decoration-border decoration-1">
              {t(item.problem)}
            </p>
            <ArrowRight
              aria-hidden="true"
              className="hidden h-4 w-4 shrink-0 text-primary sm:block"
            />
            <p className="text-base font-medium text-foreground">{t(item.solution)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

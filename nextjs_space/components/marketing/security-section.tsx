import { Building2, Cloud, KeyRound, Lock } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Every claim here maps to something implemented in the application:
 * hashed credentials, session-derived company scoping on every query,
 * TLS-only hosting, and cloud access with no local install.
 * No compliance certifications are claimed, because none have been obtained.
 */
const POINTS: Array<{ icon: typeof KeyRound; title: TranslationKey; body: TranslationKey }> = [
  { icon: KeyRound, title: 'landing.security.authTitle', body: 'landing.security.authBody' },
  { icon: Building2, title: 'landing.security.separationTitle', body: 'landing.security.separationBody' },
  { icon: Lock, title: 'landing.security.encryptionTitle', body: 'landing.security.encryptionBody' },
  { icon: Cloud, title: 'landing.security.accessTitle', body: 'landing.security.accessBody' },
];

export function SecuritySection() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <Section className="border-b border-border bg-muted/30" aria-labelledby="security-heading">
      <SectionHeading
        id="security-heading"
        eyebrow={t('landing.security.eyebrow')}
        title={t('landing.security.title')}
        description={t('landing.security.description')}
      />

      <ul className="mt-14 grid gap-6 sm:grid-cols-2">
        {POINTS.map((point) => (
          <li key={point.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
            <point.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">{t(point.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(point.body)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

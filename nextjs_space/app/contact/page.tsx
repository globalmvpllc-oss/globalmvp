import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, LifeBuoy, ShieldQuestion } from 'lucide-react';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

// Metadata stays in English: it is read by crawlers, which carry no locale
// cookie, and the canonical URL is one document rather than one per language.
export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach the CorpControl team and what each type of enquiry covers.',
  alternates: { canonical: '/contact' },
};

/**
 * Contact channels are described by topic only. No email address, postal
 * address or registration number appears here, because none is recorded
 * anywhere in this repository and inventing one would be worse than
 * publishing nothing.
 */
const CHANNELS: Array<{ icon: typeof Mail; title: TranslationKey; body: TranslationKey }> = [
  { icon: Mail, title: 'contactPage.generalTitle', body: 'contactPage.generalBody' },
  { icon: LifeBuoy, title: 'contactPage.supportTitle', body: 'contactPage.supportBody' },
  { icon: ShieldQuestion, title: 'contactPage.privacyTitle', body: 'contactPage.privacyBody' },
];

export default function ContactPage() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t('contactPage.title')}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              {t('contactPage.intro')}
            </p>

            <ul className="mt-12 space-y-4">
              {CHANNELS.map((channel) => (
                <li key={channel.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
                  <channel.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold text-foreground">{t(channel.title)}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(channel.body)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-12 rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-semibold text-foreground">{t('contactPage.reachTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('contactPage.reachBody')}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-semibold text-foreground">{t('contactPage.businessTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('contactPage.businessBody')}
              </p>
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              {t('contactPage.moreLead')}
              <Link href="/#faq" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {t('contactPage.moreFaqLink')}
              </Link>
              {t('contactPage.moreMid')}
              <Link href="/privacy" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {t('contactPage.morePrivacyLink')}
              </Link>
              {t('contactPage.moreTail')}
            </p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}

import Link from 'next/link';
import { Logo } from '@/components/marketing/logo';
import { Container } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

const COLUMNS: Array<{
  heading: TranslationKey;
  links: Array<{ href: string; key: TranslationKey }>;
}> = [
  {
    heading: 'landing.footer.product',
    links: [
      { href: '/#features', key: 'landing.nav.features' },
      { href: '/#how-it-works', key: 'landing.nav.howItWorks' },
      { href: '/pricing', key: 'landing.nav.pricing' },
      { href: '/#faq', key: 'landing.nav.faq' },
    ],
  },
  {
    heading: 'landing.footer.company',
    links: [{ href: '/contact', key: 'landing.footer.contact' }],
  },
  {
    heading: 'landing.footer.legal',
    links: [
      { href: '/privacy', key: 'landing.footer.privacy' },
      { href: '/terms', key: 'landing.footer.terms' },
      { href: '/cookies', key: 'landing.footer.cookies' },
      { href: '/kvkk', key: 'landing.footer.kvkk' },
      { href: '/refund', key: 'landing.footer.refund' },
    ],
  },
];

export function SiteFooter() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <footer className="border-t border-border bg-muted/30">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t('landing.footer.tagline')}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
                {t(column.heading)}
              </h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} CorpControl. {t('landing.footer.rights')}
          </p>
          <div className="flex gap-6">
            <Link href="/auth/login" className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t('landing.cta.logIn')}
            </Link>
            <Link href="/auth/signup" className="rounded text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t('landing.cta.startFree')}
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

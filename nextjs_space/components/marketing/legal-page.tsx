import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n';

/**
 * Shell for the public marketing and legal pages.
 *
 * The body copy on the legal pages is a working structure, not legal advice.
 * Placeholders written as [BRACKETED TEXT] mark where the real registered
 * business details must be inserted before these pages are relied upon.
 *
 * Only the shell's own chrome ("Last updated:") follows the selected language.
 * The `title`, `intro` and `children` a page passes in are its authored legal
 * text and are deliberately left in the language they were written in —
 * /privacy, /terms and /cookies in English, /kvkk in Turkish. Machine
 * translating terms someone is agreeing to would change what they agreed to.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated?: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const locale = getServerLocale();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {updated ? (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {translate(locale, 'legal.lastUpdated')} {updated}
              </p>
            ) : null}
            {intro ? (
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{intro}</p>
            ) : null}
            <div className="mt-10 space-y-8 border-t border-border pt-10">{children}</div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Logo } from '@/components/marketing/logo';
import { Container } from '@/components/marketing/section';
import { LanguageSelector } from '@/components/language-selector';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';

const NAV_LINKS: Array<{ href: string; key: TranslationKey }> = [
  { href: '/#features', key: 'landing.nav.features' },
  { href: '/#how-it-works', key: 'landing.nav.howItWorks' },
  { href: '/pricing', key: 'landing.nav.pricing' },
  { href: '/#faq', key: 'landing.nav.faq' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav aria-label={t('landing.nav.main')} className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {/* Same control as the application sidebar: one cookie, one
                router.refresh(), so a language chosen here is still in effect
                after signing in. */}
            <LanguageSelector variant="compact" />
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/login">{t('landing.cta.logIn')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/signup">{t('landing.cta.startFree')}</Link>
            </Button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <LanguageSelector variant="compact" />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('landing.nav.openMenu')}>
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-xs">
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
                <nav aria-label={t('landing.nav.mobile')} className="mt-8 flex flex-col gap-1">
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t(link.key)}
                    </Link>
                  ))}
                </nav>
                <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
                  <Button asChild variant="outline" onClick={() => setOpen(false)}>
                    <Link href="/auth/login">{t('landing.cta.logIn')}</Link>
                  </Button>
                  <Button asChild onClick={() => setOpen(false)}>
                    <Link href="/auth/signup">{t('landing.cta.startFree')}</Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </Container>
    </header>
  );
}

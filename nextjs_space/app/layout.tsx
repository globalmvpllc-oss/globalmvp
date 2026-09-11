import type { Metadata } from 'next';
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';
import { Providers } from '@/components/providers';
import { siteConfig, getBaseUrl } from '@/lib/site';
import { getServerLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/components/i18n-provider';
import { CookieConsent } from '@/components/cookie-consent';
import { consentBootstrapScript } from '@/lib/consent';
import Script from 'next/script';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: `${siteConfig.name} â€” ${siteConfig.tagline}`,
    template: `%s â€” ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    'invoicing software',
    'small business finance',
    'expense tracking',
    'invoice management',
    'freelancer invoicing',
    'business finance dashboard',
    'multi-currency invoicing',
    'payment tracking',
  ],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: `${siteConfig.name} â€” ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: '/',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${siteConfig.name} dashboard` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} â€” ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: ['/og-image.png'],
  },
};

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: getBaseUrl(),
    description: siteConfig.description,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: getBaseUrl(),
    description: siteConfig.description,
    featureList: [
      'Invoicing',
      'Customer management',
      'Income and expense tracking',
      'Payment recording',
      'Financial dashboard',
      'Reports',
      'Due date calendar',
      'Multi-currency support',
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so the first HTML already carries the right language.
  // Deciding this on the client would render English and swap after hydration.
  const locale = getServerLocale();

  return (
    /**
     * `translate="no"` + `notranslate` switch off browser page translation.
     *
     * Chrome's translator replaces the text nodes React owns. When a Radix
     * portal then unmounts â€” closing a Select, for instance â€” React calls
     * removeChild on a node the translator has already swapped, and the app
     * crashes with "The node to be removed is not a child of this node". That
     * is exactly what happened when picking a category.
     *
     * The application translates itself instead, so nothing is lost: the
     * language selector still works, and `lang` below tells assistive
     * technology which language is actually on screen.
     */
    <html lang={locale} translate="no" className="notranslate" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        {/*
          Google Consent Mode v2 defaults, established before anything else on
          the page can run. Every signal starts denied, so a visitor who has
          made no choice is in the same position as one who declined.

          A plain <script> rather than next/script with `beforeInteractive`,
          which was tried first and rejected on the evidence: that strategy
          emits `(self.__next_s=...).push(...)` and leaves execution to Next's
          own loader after the framework bundle arrives. Ordering against the
          Google tag would still have held — the tag mounts after hydration —
          but the defaults are the one thing that must not depend on any of
          that machinery working. Inline here, they run while the parser is
          still on this line.

          The tag itself is not here. It is mounted by `CookieConsent` below,
          and only once someone has allowed it.
        */}
        <script dangerouslySetInnerHTML={{ __html: consentBootstrapScript() }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <I18nProvider initialLocale={locale}>
          <Providers>
            {children}
            <Toaster />
            <CookieConsent />
            <ChunkLoadErrorHandler />
          </Providers>
          </I18nProvider>
        </ThemeProvider>
        <Script
          src="https://ai-chatbot-widget-saa-s-chi.vercel.app/api/widget.js?id=4c749a04-af81-4b07-9756-c0f4b928983d"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

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

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
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
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: '/',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${siteConfig.name} dashboard` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
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
     * portal then unmounts — closing a Select, for instance — React calls
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <I18nProvider initialLocale={locale}>
          <Providers>
            {children}
            <Toaster />
            <ChunkLoadErrorHandler />
          </Providers>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

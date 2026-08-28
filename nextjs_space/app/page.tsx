import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Hero } from '@/components/marketing/hero';
import { TrustBar } from '@/components/marketing/trust-bar';
import { ProblemSolution } from '@/components/marketing/problem-solution';
import { ProductPreview } from '@/components/marketing/product-preview';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Benefits } from '@/components/marketing/benefits';
import { PricingTeaser } from '@/components/marketing/pricing-teaser';
import { SecuritySection } from '@/components/marketing/security-section';
import { Faq } from '@/components/marketing/faq';
import { FinalCta } from '@/components/marketing/final-cta';
import { getFaqs } from '@/components/marketing/faq-data';
import { getServerLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * FAQPage structured data, generated from the same questions the accordion
 * renders below, so the schema can never describe questions a visitor cannot
 * see — including when the visitor has switched language.
 * Organization and SoftwareApplication schemas live in app/layout.tsx.
 */
function buildFaqJsonLd(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

/**
 * The public landing page, served to everyone.
 *
 * This used to redirect a signed-in visitor to /dashboard, which meant the
 * marketing site was unreachable on the production domain for anyone with a
 * session — the root URL simply became the application. A signed-in user
 * following a link to corpcontrol.net, or wanting to read the pricing page,
 * could never see it.
 *
 * Both audiences are served from here now: the page renders the same content
 * for everyone, and the header offers "Log in" / "Start free" or a way through
 * to the application depending on the session. Nothing about the protected
 * routes changes — /dashboard and everything under it are still gated by
 * middleware.
 */
export default async function Home() {
  const faqJsonLd = buildFaqJsonLd(getFaqs(getServerLocale()));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <TrustBar />
        <ProblemSolution />
        <ProductPreview />
        <FeatureGrid />
        <HowItWorks />
        <Benefits />
        <PricingTeaser />
        <SecuritySection />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

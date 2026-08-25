import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'FinanceFlow pricing. Start free and manage invoices, expenses and payments for your small business.',
  alternates: { canonical: '/pricing' },
};

const INCLUDED = [
  'Invoices with line items, tax and discounts',
  'Customer and vendor records',
  'Income and expense tracking',
  'Full and partial payment recording',
  'Financial dashboard and reports',
  'Calendar of due dates',
  'Multi-currency support (USD, EUR, GBP, TRY)',
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Pricing</p>
              <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Start simple. Grow when you need to.
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                FinanceFlow is built for freelancers, consultants, agencies and small businesses.
                Create an account and start using it today.
              </p>
            </div>

            <div className="mx-auto mt-14 max-w-xl">
              <div className="rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  Get started
                </p>
                <h2 className="mt-3 font-display text-2xl font-bold text-foreground">
                  Everything in one workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Detailed plans are still being finalised. In the meantime you can create an account
                  and use FinanceFlow to run your business finances.
                </p>

                <ul className="mt-8 space-y-3">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-foreground">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Button asChild size="lg" className="mt-8 w-full">
                  <Link href="/auth/signup">
                    Start free
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  No bank connection required.
                </p>
              </div>

              <p className="mt-8 text-center text-sm text-muted-foreground">
                Have a question about plans?{' '}
                <Link href="/contact" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Get in touch
                </Link>
                .
              </p>
            </div>
          </Container>
        </section>

        <section className="py-16 sm:py-20" aria-labelledby="pricing-cta-heading">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="pricing-cta-heading"
                className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Ready to get your finances in order?
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Create an account and start recording invoices, expenses and payments today.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/auth/signup">
                    Start free
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/#faq">Read the FAQ</Link>
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

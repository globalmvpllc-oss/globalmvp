import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipLink } from '@/components/marketing/skip-link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Container, Section, SectionHeading } from '@/components/marketing/section';

/**
 * Shared shell for the search-acquisition landing pages.
 *
 * One template rather than three near-identical page files: the layout, spacing
 * and typography are the same as the home page, and only the copy differs per
 * keyword group. Each page supplies already-translated strings, so the template
 * stays free of dictionary lookups and is trivial to read.
 *
 * Deliberately short. Someone arriving from a search ad has a specific question
 * and a back button; the page answers the question, shows what the product
 * actually does, and asks for the signup. The full pricing table is not
 * repeated here — it lives on /pricing and the home page, linked from the
 * closing call to action.
 */

export interface LandingBenefit {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface LandingStep {
  number: string;
  title: string;
  body: string;
}

export interface AcquisitionLandingProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Short reassurances under the hero buttons. */
  heroPoints: string[];
  primaryCta: string;
  secondaryCta: string;
  secondaryCtaHref: string;
  benefitsEyebrow: string;
  benefitsTitle: string;
  benefits: LandingBenefit[];
  stepsEyebrow: string;
  stepsTitle: string;
  steps: LandingStep[];
  /** Concrete product capabilities, phrased as facts rather than promises. */
  featuresTitle: string;
  features: string[];
  closingTitle: string;
  closingBody: string;
  pricingCta: string;
}

export function AcquisitionLanding(props: AcquisitionLandingProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]"
          />
          <Container className="relative">
            <div className="py-16 sm:py-24">
              <div className="mx-auto max-w-3xl text-center">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  {props.eyebrow}
                </p>
                <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                  {props.title}
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  {props.subtitle}
                </p>

                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link href="/auth/signup">
                      {props.primaryCta}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                    <Link href={props.secondaryCtaHref}>{props.secondaryCta}</Link>
                  </Button>
                </div>

                <ul className="mt-8 flex flex-col items-center justify-center gap-x-6 gap-y-2 sm:flex-row">
                  {props.heroPoints.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        {/* Benefits */}
        <Section className="border-b border-border" aria-labelledby="landing-benefits-heading">
          <SectionHeading
            id="landing-benefits-heading"
            eyebrow={props.benefitsEyebrow}
            title={props.benefitsTitle}
          />
          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {props.benefits.map((benefit) => (
              <li
                key={benefit.title}
                className="rounded-xl border border-border bg-card p-6 transition-colors duration-normal hover:border-primary/30"
              >
                <span className="inline-grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <benefit.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {benefit.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* How it works */}
        <Section className="border-b border-border bg-muted/30" aria-labelledby="landing-steps-heading">
          <SectionHeading
            id="landing-steps-heading"
            eyebrow={props.stepsEyebrow}
            title={props.stepsTitle}
          />
          <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {props.steps.map((step) => (
              <li key={step.number} className="border-t-2 border-primary/20 pt-6">
                <span className="font-mono text-sm font-semibold tracking-[0.16em] text-primary">
                  {step.number}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* What the product actually does */}
        <Section className="border-b border-border" aria-labelledby="landing-features-heading">
          <div className="mx-auto max-w-3xl">
            <SectionHeading id="landing-features-heading" title={props.featuresTitle} />
            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {props.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm text-foreground">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* Closing call to action */}
        <section className="relative overflow-hidden py-20 sm:py-28" aria-labelledby="landing-closing-heading">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_65%)]"
          />
          <Container className="relative">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="landing-closing-heading"
                className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {props.closingTitle}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{props.closingBody}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/auth/signup">
                    {props.primaryCta}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/pricing">{props.pricingCta}</Link>
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

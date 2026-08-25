import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/section';

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28" aria-labelledby="final-cta-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_65%)]"
      />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="final-cta-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Take control of your business finances
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Keep invoices, expenses, payments and financial insights in one simple workspace.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/auth/signup">
                Start free
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
              <Link href="/auth/login">Log in</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

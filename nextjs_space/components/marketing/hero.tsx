import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/section';
import { DashboardPreview } from '@/components/marketing/dashboard-preview';

const TRUST_POINTS = ['No bank connection required', 'Set up in minutes', 'Works in multiple currencies'];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Restrained ambient wash — one soft tint, no gradient stack */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <Container className="relative">
        <div className="py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Business finance, simplified
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Run your business finances without the complexity
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              FinanceFlow keeps invoices, customers, income, expenses and payments in one simple
              workspace &mdash; so you always know where your money stands, without learning
              accounting software.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/auth/signup">
                  Start free
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/#how-it-works">See how it works</Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-col items-center justify-center gap-x-6 gap-y-2 sm:flex-row">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto mt-14 max-w-4xl sm:mt-16">
            <DashboardPreview />
          </div>
        </div>
      </Container>
    </section>
  );
}

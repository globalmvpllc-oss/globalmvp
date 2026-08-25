import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/section';

export function PricingTeaser() {
  return (
    <Section id="pricing" className="border-b border-border" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
        <SectionHeading
          id="pricing-heading"
          eyebrow="Pricing"
          title="Start simple. Grow when you need to."
          description="FinanceFlow is built for freelancers, consultants, agencies and small businesses — people who need their finances in order, not an enterprise finance department."
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/auth/signup">
              Start free
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/pricing">See plans</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

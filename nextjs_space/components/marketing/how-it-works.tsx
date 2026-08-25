import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/section';

/**
 * Numbered because this genuinely is a sequence — each step depends on the
 * one before it. The onboarding flow enforces the same order.
 */
const STEPS = [
  {
    number: '01',
    title: 'Create your account',
    body: 'Sign up with an email address and a password. Nothing to install, nothing to configure.',
  },
  {
    number: '02',
    title: 'Set up your business',
    body: 'Add your business name, country and default currency. Categories are created for you.',
  },
  {
    number: '03',
    title: 'Track your finances',
    body: 'Add customers, send invoices, record expenses and payments. Your dashboard fills itself in.',
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-b border-border bg-muted/30" aria-labelledby="how-heading">
      <SectionHeading
        id="how-heading"
        eyebrow="Getting started"
        title="Three steps, then you are working"
        description="Setup is short. Once your business details are in, you can create your first invoice straight away."
      />

      <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step) => (
          <li key={step.number} className="relative border-t-2 border-primary/20 pt-6">
            <span className="font-mono text-sm font-semibold tracking-[0.16em] text-primary">
              {step.number}
            </span>
            <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex justify-center">
        <Button asChild size="lg">
          <Link href="/auth/signup">Start free</Link>
        </Button>
      </div>
    </Section>
  );
}

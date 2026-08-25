import { BarChart3, CalendarDays, FileText, Receipt, Users, Wallet } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';

const FEATURES = [
  {
    icon: FileText,
    title: 'Invoices',
    body: 'Build invoices with line items, tax and discounts, then track them from draft through to paid.',
  },
  {
    icon: Users,
    title: 'Customers',
    body: 'Keep customer details in one place and see every invoice and payment tied to each of them.',
  },
  {
    icon: Receipt,
    title: 'Income & expenses',
    body: 'Record what comes in and what goes out, with categories, dates and due dates that stay tidy.',
  },
  {
    icon: Wallet,
    title: 'Payments',
    body: 'Log full or partial payments against an invoice and watch its status update on its own.',
  },
  {
    icon: CalendarDays,
    title: 'Calendar',
    body: 'See invoice due dates, expense due dates and payment dates laid out across the month.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    body: 'Review income against expenses over time, broken down by category and kept per currency.',
  },
];

export function FeatureGrid() {
  return (
    <Section id="features" className="border-b border-border" aria-labelledby="features-heading">
      <SectionHeading
        id="features-heading"
        eyebrow="What you get"
        title="Everything you need, nothing you do not"
        description="Six areas that cover how money actually moves through a small business."
      />

      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="group rounded-xl border border-border bg-card p-6 transition-all duration-normal hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
          >
            <span className="inline-grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-colors duration-normal group-hover:bg-primary/15">
              <feature.icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

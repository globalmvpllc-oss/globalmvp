import { Section, SectionHeading } from '@/components/marketing/section';

const BENEFITS = [
  {
    title: 'Know what is happening with your money',
    body: 'Revenue, expenses and what is still owed to you, on one screen, kept separate per currency.',
  },
  {
    title: 'Stay on top of outstanding payments',
    body: 'Every invoice carries its status and due date, so nothing quietly slips past its deadline.',
  },
  {
    title: 'Keep business finances organised',
    body: 'Customers, invoices, expenses and payments stay connected instead of scattered across files.',
  },
  {
    title: 'Spend less time managing spreadsheets',
    body: 'Record something once. Totals, statuses and reports follow from it without extra work.',
  },
];

export function Benefits() {
  return (
    <Section className="border-b border-border" aria-labelledby="benefits-heading">
      <SectionHeading
        id="benefits-heading"
        eyebrow="Why it helps"
        title="Less admin, clearer numbers"
      />

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="border-l-2 border-primary/25 pl-5">
            <h3 className="font-display text-lg font-semibold text-foreground">{benefit.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

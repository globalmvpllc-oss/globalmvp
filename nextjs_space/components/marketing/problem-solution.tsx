import { ArrowRight } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';

const PROBLEMS = [
  {
    problem: 'Numbers live in three different spreadsheets',
    solution: 'One workspace holds invoices, income, expenses and payments together.',
  },
  {
    problem: 'An unpaid invoice goes unnoticed for weeks',
    solution: 'Outstanding balances and due dates sit on the dashboard and calendar.',
  },
  {
    problem: 'Expenses get reconstructed from memory at year end',
    solution: 'Record an expense when it happens, with a category and a due date.',
  },
  {
    problem: 'Accounting software assumes you are an accountant',
    solution: 'Plain screens, plain language, nothing you need a course to operate.',
  },
];

export function ProblemSolution() {
  return (
    <Section className="border-b border-border" aria-labelledby="problem-heading">
      <SectionHeading
        id="problem-heading"
        eyebrow="The problem"
        title="Most small businesses do not need accounting software"
        description="They need to know who owes them money, what they spent, and whether the month worked out. That is a much smaller problem, and it deserves a much smaller tool."
      />

      <ul className="mx-auto mt-14 max-w-3xl divide-y divide-border border-y border-border">
        {PROBLEMS.map((item) => (
          <li key={item.problem} className="grid gap-2 py-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6">
            <p className="text-base text-muted-foreground line-through decoration-border decoration-1">
              {item.problem}
            </p>
            <ArrowRight
              aria-hidden="true"
              className="hidden h-4 w-4 shrink-0 text-primary sm:block"
            />
            <p className="text-base font-medium text-foreground">{item.solution}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

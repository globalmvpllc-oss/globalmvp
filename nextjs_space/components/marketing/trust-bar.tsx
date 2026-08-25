import { Coins, Gauge, Layers, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/marketing/section';

/**
 * Product facts, not social proof. FinanceFlow has no customers to cite yet,
 * so every claim here maps to something the application actually does.
 */
const FACTS = [
  { icon: Gauge, title: 'Simple setup', body: 'Create an account, add your business details, start invoicing.' },
  { icon: Coins, title: 'Multiple currencies', body: 'Invoice and record payments in USD, EUR, GBP or TRY.' },
  { icon: ShieldCheck, title: 'No bank connection', body: 'Nothing to link. You stay in control of what goes in.' },
  { icon: Layers, title: 'One overview', body: 'Invoices, expenses and payments in a single dashboard.' },
];

export function TrustBar() {
  return (
    <div className="border-b border-border bg-muted/30 py-10">
      <Container>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => (
            <li key={fact.title} className="flex gap-3">
              <fact.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">{fact.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{fact.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

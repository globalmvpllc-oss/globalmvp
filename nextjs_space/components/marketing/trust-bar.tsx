import { Coins, Gauge, Layers, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/marketing/section';
import { getServerLocale } from '@/lib/i18n/server';
import { translate, type TranslationKey } from '@/lib/i18n';

/**
 * Product facts, not social proof. CorpControl has no customers to cite yet,
 * so every claim here maps to something the application actually does.
 */
const FACTS: Array<{ icon: typeof Gauge; title: TranslationKey; body: TranslationKey }> = [
  { icon: Gauge, title: 'landing.trust.setupTitle', body: 'landing.trust.setupBody' },
  { icon: Coins, title: 'landing.trust.currenciesTitle', body: 'landing.trust.currenciesBody' },
  { icon: ShieldCheck, title: 'landing.trust.noBankTitle', body: 'landing.trust.noBankBody' },
  { icon: Layers, title: 'landing.trust.overviewTitle', body: 'landing.trust.overviewBody' },
];

export function TrustBar() {
  const locale = getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <div className="border-b border-border bg-muted/30 py-10">
      <Container>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => (
            <li key={fact.title} className="flex gap-3">
              <fact.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">{t(fact.title)}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(fact.body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

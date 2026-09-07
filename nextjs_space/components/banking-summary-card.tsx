'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Landmark, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { useI18n } from '@/components/i18n-provider';

/**
 * The banking strip on the main dashboard.
 *
 * Self-contained on purpose: it fetches its own summary and renders nothing at
 * all when the company has no bank accounts, so adding it to the dashboard is a
 * one-line change and a business that never uses banking sees exactly the
 * dashboard it saw before.
 *
 * Its own request failing is silent for the same reason — a banking outage must
 * not put an error where the revenue figures are. The full state, with a retry,
 * lives on /banking.
 */

interface Summary {
  cashPosition: Array<{ currency: string; total: string; accountsWithoutBalance: number }>;
  counts: { unmatched: number };
  hasAccounts: boolean;
}

export function BankingSummaryCard() {
  const { t, fill } = useI18n();
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/banking/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!data?.hasAccounts) return null;

  const unreconciled = data.counts?.unmatched ?? 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">{t('dashboard.bankBalances')}</p>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {(data.cashPosition ?? []).map((position) => (
                  <span key={position.currency} className="font-mono font-bold">
                    {formatCurrency(position.total, position.currency)}
                    {/* Flagged rather than folded into the number: an account
                        with no reported balance is unknown, not empty. */}
                    {position.accountsWithoutBalance > 0 ? (
                      <span className="ml-1 text-xs font-sans font-normal text-muted-foreground">
                        ({t('dashboard.bankPartial')})
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {unreconciled > 0 ? (
              <Badge variant="secondary">
                {fill('dashboard.bankToReconcile', { count: unreconciled })}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">{t('dashboard.bankAllReconciled')}</span>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={unreconciled > 0 ? '/banking/reconcile' : '/banking'}>
                {t('nav.banking')} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { readErrorMessage, networkErrorMessage } from '@/lib/api-feedback';
import { useI18n } from '@/components/i18n-provider';
import { toAmount } from '@/lib/payment-math';
import { emptyTotals, type ReportsPayload } from '@/lib/reports-aggregate';

const RechartsCharts = dynamic(() => import('@/components/reports-charts'), { ssr: false, loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse" /> });

/**
 * Reports.
 *
 * Every figure on this page is computed by Postgres and arrives finished from
 * /api/reports. This component only formats and draws.
 *
 * It used to fetch three paginated lists and add them up here, which meant a
 * company with more records than a page could hold saw totals derived from a
 * partial list — hence the "these totals are partial" banner that used to sit
 * at the top. There is nothing left to truncate, so the banner is gone rather
 * than merely quiet: with server-side aggregation it would be a lie.
 */
export default function ReportsPage() {
  const { t, locale } = useI18n();
  const [report, setReport] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the report could not be loaded, kept separate from the empty
   *  state so a failed request is not shown as "Nothing to report yet". */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) {
        setLoadError(await readErrorMessage(res, locale));
        return;
      }
      setReport(await res.json());
    } catch {
      setLoadError(networkErrorMessage(locale));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="space-y-6"><div className="h-8 w-48 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded-lg animate-pulse" /></div>;

  if (loadError) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('reports.title')}</h1>
        <p className="text-muted-foreground">{t('reports.subtitle')}</p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <h3 className="font-medium mb-1">{t('reports.loadFailed')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" onClick={() => { setLoading(true); load(); }}>{t('common.tryAgain')}</Button>
        </CardContent>
      </Card>
    </div>
  );

  const currencies = report?.currencies ?? [];

  /**
   * Whether there is anything to report on at all.
   *
   * Answered by the server from unfiltered record counts, not from the totals:
   * a company whose only income is still EXPECTED has records but no received
   * money, and telling it "you have not entered anything yet" would be wrong.
   * A full set of zeroed cards reads as "your business earned nothing" rather
   * than "you have not entered anything yet", which is why the two states are
   * kept apart.
   */
  const hasRecords = report?.hasRecords ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('reports.title')}</h1>
        <p className="text-muted-foreground">{t('reports.subtitle')}</p>
      </div>

      {!hasRecords ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">{t('reports.empty')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('reports.emptyHint')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/invoices/new">{t('reports.emptyCreateInvoice')}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/income">{t('income.add')}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/expenses">{t('expenses.add')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasRecords && currencies.map((cur) => {
        // Amounts cross JSON as fixed-decimal strings; `toAmount` is the one
        // place they become numbers for display.
        // Named `totals` rather than `t`, which is the translator on this page.
        const totals = report?.byCurrency?.[cur] ?? emptyTotals();
        return (
          <div key={cur}>
            {currencies.length > 1 && (
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{cur}</h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-green-600" /></div><div><p className="text-xs text-muted-foreground">{t('reports.totalIncome')}</p><p className="text-lg font-mono font-bold">{formatCurrency(toAmount(totals.income), cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-500" /></div><div><p className="text-xs text-muted-foreground">{t('reports.totalExpenses')}</p><p className="text-lg font-mono font-bold">{formatCurrency(toAmount(totals.expenses), cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-blue-600" /></div><div><p className="text-xs text-muted-foreground">{t('reports.totalInvoiced')}</p><p className="text-lg font-mono font-bold">{formatCurrency(toAmount(totals.invoiced), cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">{t('reports.collected')}</p><p className="text-lg font-mono font-bold">{formatCurrency(toAmount(totals.collected), cur)}</p></div></div></CardContent></Card>
            </div>
          </div>
        );
      })}

      <RechartsCharts report={report} />
    </div>
  );
}

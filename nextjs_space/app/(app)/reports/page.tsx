'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';

const RechartsCharts = dynamic(() => import('@/components/reports-charts'), { ssr: false, loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse" /> });

export default function ReportsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  /** Set when a source list could not be loaded, kept separate from the empty
   *  state so a failed request is not shown as "Nothing to report yet". */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True when at least one source returned more rows than it handed back, so the
   *  totals below are computed from a partial list. */
  const [truncated, setTruncated] = useState(false);

  /** The API's maximum invoice page. Invoices carry no "has more" header, so a
   *  full page is the only signal that more rows exist than the totals can see. */
  const INVOICE_TAKE = 200;

  const load = async () => {
    setLoadError(null);
    setTruncated(false);
    try {
      const [incRes, expRes, invRes, compRes] = await Promise.all([
        fetch('/api/income'),
        fetch('/api/expenses'),
        fetch(`/api/invoices?take=${INVOICE_TAKE}`),
        fetch('/api/company'),
      ]);

      // The three financial lists drive every total on this page. A failed
      // request must not resolve to [] and render "Nothing to report yet".
      if (!incRes.ok || !expRes.ok || !invRes.ok) {
        const failed = !incRes.ok ? incRes : !expRes.ok ? expRes : invRes;
        setLoadError(await readErrorMessage(failed));
        return;
      }

      const [income, expenses, invoices] = await Promise.all([
        incRes.json(), expRes.json(), invRes.json(),
      ]);
      const comp = compRes.ok ? await compRes.json().catch(() => null) : null;
      const invoiceRows = Array.isArray(invoices) ? invoices : [];

      // income/expenses report truncation via X-Has-More; invoices report it by
      // filling the whole page. Any of the three means the totals are partial.
      const wasTruncated =
        incRes.headers.get('X-Has-More') === 'true' ||
        expRes.headers.get('X-Has-More') === 'true' ||
        invoiceRows.length >= INVOICE_TAKE;

      setData({
        income: Array.isArray(income) ? income : [],
        expenses: Array.isArray(expenses) ? expenses : [],
        invoices: invoiceRows,
      });
      setCompany(comp);
      setTruncated(wasTruncated);
    } catch {
      setLoadError(NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const defaultCurrency = company?.defaultCurrency ?? 'USD';

  if (loading) return <div className="space-y-6"><div className="h-8 w-48 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded-lg animate-pulse" /></div>;

  if (loadError) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Financial overview and insights</p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <h3 className="font-medium mb-1">Could not load reports</h3>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" onClick={() => { setLoading(true); load(); }}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );

  // Group totals by currency
  const totals: Record<string, { income: number; expenses: number; invoiced: number; collected: number }> = {};
  const ensure = (c: string) => { if (!totals[c]) totals[c] = { income: 0, expenses: 0, invoiced: 0, collected: 0 }; };

  for (const i of (data?.income ?? [])) {
    if (i?.status !== 'RECEIVED') continue;
    const cur = i?.currency || defaultCurrency;
    ensure(cur);
    totals[cur].income += Number(i?.amount) || 0;
  }
  for (const e of (data?.expenses ?? [])) {
    if (e?.status !== 'PAID') continue;
    const cur = e?.currency || defaultCurrency;
    ensure(cur);
    totals[cur].expenses += Number(e?.amount) || 0;
  }
  for (const inv of (data?.invoices ?? [])) {
    const cur = inv?.currency || defaultCurrency;
    ensure(cur);
    totals[cur].invoiced += Number(inv?.total) || 0;
    totals[cur].collected += Number(inv?.amountPaid) || 0;
  }

  const currencies = Object.keys(totals);
  if (currencies.length === 0) currencies.push(defaultCurrency);

  /**
   * Whether there is anything to report on at all.
   *
   * Without this the page rendered a full set of zeroed cards and empty charts,
   * which reads as "your business earned nothing" rather than "you have not
   * entered anything yet" — a discouraging first impression, and ambiguous even
   * for an existing user who filtered their way to nothing.
   */
  const hasRecords =
    (data?.income?.length ?? 0) > 0 ||
    (data?.expenses?.length ?? 0) > 0 ||
    (data?.invoices?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Financial overview and insights</p>
      </div>

      {truncated ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These totals cover your most recent records only. There are more than this page can add up, so the
          figures below are partial.
        </div>
      ) : null}

      {!hasRecords ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">Nothing to report yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Reports build themselves from your invoices, income and expenses. Add a record and it will
              show up here.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/invoices/new">Create your first invoice</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/income">Add income</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/expenses">Add expense</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasRecords && currencies.map((cur) => {
        const t = totals[cur] ?? { income: 0, expenses: 0, invoiced: 0, collected: 0 };
        return (
          <div key={cur}>
            {currencies.length > 1 && (
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{cur}</h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-green-600" /></div><div><p className="text-xs text-muted-foreground">Total Income</p><p className="text-lg font-mono font-bold">{formatCurrency(t.income, cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-500" /></div><div><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-lg font-mono font-bold">{formatCurrency(t.expenses, cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-blue-600" /></div><div><p className="text-xs text-muted-foreground">Total Invoiced</p><p className="text-lg font-mono font-bold">{formatCurrency(t.invoiced, cur)}</p></div></div></CardContent></Card>
              <Card><CardContent className="pt-5 pb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-mono font-bold">{formatCurrency(t.collected, cur)}</p></div></div></CardContent></Card>
            </div>
          </div>
        );
      })}

      <RechartsCharts data={data} defaultCurrency={defaultCurrency} />
    </div>
  );
}

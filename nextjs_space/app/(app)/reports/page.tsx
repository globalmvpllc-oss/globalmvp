'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import dynamic from 'next/dynamic';

const RechartsCharts = dynamic(() => import('@/components/reports-charts'), { ssr: false, loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse" /> });

export default function ReportsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/income').then((r: any) => r.json()),
      fetch('/api/expenses').then((r: any) => r.json()),
      fetch('/api/invoices').then((r: any) => r.json()),
      fetch('/api/company').then((r: any) => r.json()),
    ]).then(([income, expenses, invoices, comp]: any) => {
      setData({
        income: Array.isArray(income) ? income : [],
        expenses: Array.isArray(expenses) ? expenses : [],
        invoices: Array.isArray(invoices) ? invoices : [],
      });
      setCompany(comp);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const defaultCurrency = company?.defaultCurrency ?? 'USD';

  if (loading) return <div className="space-y-6"><div className="h-8 w-48 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded-lg animate-pulse" /></div>;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Financial overview and insights</p>
      </div>

      {currencies.map((cur) => {
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

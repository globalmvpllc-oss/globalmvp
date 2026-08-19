'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, TrendingDown, Clock, AlertCircle, FileText, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { format } from 'date-fns';

interface CurrencyMetrics {
  revenue: string;
  expenses: string;
  profit: string;
  receivables: string;
  upcomingPayments: string;
}

interface DashboardData {
  byCurrency: Record<string, CurrencyMetrics>;
  activities: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    amount: string | number;
    currency: string;
    date: string;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then((r: any) => r.json()),
      fetch('/api/company').then((r: any) => r.json()),
    ]).then(([d, c]: any) => {
      setData(d);
      setCompany(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const defaultCurrency = company?.defaultCurrency ?? 'USD';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_: any, i: number) => <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  const byCurrency = data?.byCurrency ?? {};
  const currencies = Object.keys(byCurrency);

  // If no data at all, show zeros in company default currency
  const displayCurrencies = currencies.length > 0 ? currencies : [defaultCurrency];

  const metricDefs = [
    { key: 'revenue', label: 'Revenue', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { key: 'expenses', label: 'Expenses', icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
    { key: 'profit', label: 'Profit', icon: DollarSign, color: 'text-primary', bg: 'bg-primary/5' },
    { key: 'receivables', label: 'Receivables', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'upcomingPayments', label: 'Upcoming', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' },
  ] as const;

  const getActivityIcon = (type: string) => {
    if (type === 'overdue_invoice') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (type === 'invoice_due') return <FileText className="w-4 h-4 text-amber-500" />;
    return <CreditCard className="w-4 h-4 text-blue-500" />;
  };

  const getActivityBadge = (type: string) => {
    if (type === 'overdue_invoice') return <Badge variant="destructive" className="text-xs">Overdue</Badge>;
    if (type === 'invoice_due') return <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">Due soon</Badge>;
    return <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">Payment due</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your business at a glance this month</p>
      </div>

      {/* Metrics per currency */}
      {displayCurrencies.map((cur) => {
        const m = byCurrency[cur] ?? { revenue: '0', expenses: '0', profit: '0', receivables: '0', upcomingPayments: '0' };
        return (
          <div key={cur}>
            {displayCurrencies.length > 1 && (
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{cur}</h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {metricDefs.map((def) => {
                const Icon = def.icon;
                const val = Number(m[def.key]) || 0;
                return (
                  <Card key={def.key}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${def.bg} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${def.color}`} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">{def.label}</p>
                          <p className="text-lg font-bold font-mono">{formatCurrency(val, cur)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.activities?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No upcoming activity. Create your first invoice to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.activities ?? []).map((activity: any) => (
                <div key={activity?.id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    {getActivityIcon(activity?.type ?? '')}
                    <div>
                      <p className="text-sm font-medium">{activity?.title ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{activity?.subtitle ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getActivityBadge(activity?.type ?? '')}
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium">{formatCurrency(Number(activity?.amount) || 0, activity?.currency ?? defaultCurrency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity?.date ? format(new Date(activity.date), 'MMM d, yyyy') : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

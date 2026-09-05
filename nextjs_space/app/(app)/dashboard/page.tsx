'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, TrendingDown, Clock, AlertCircle, FileText, CreditCard, UserPlus } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { format } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getCompanyInitials, resolveStoredFileUrl } from '@/lib/company-identity';
import { BankingSummaryCard } from '@/components/banking-summary-card';

interface CurrencyMetrics {
  revenue: string;
  expenses: string;
  profit: string;
  receivables: string;
  upcomingPayments: string;
}

interface DashboardData {
  byCurrency: Record<string, CurrencyMetrics>;
  /**
   * Whether this business has ever recorded an invoice, income or expense.
   *
   * Computed server-side from unfiltered counts rather than from the metrics
   * below: those are month-scoped and status-filtered, so they are empty for an
   * established company that simply had a quiet month.
   */
  hasRecords: boolean;
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

/**
 * Shortcuts to the flows that already exist elsewhere in the application.
 *
 * Routes verified against the repository: /invoices/new is a real page, and the
 * income, expense and customer list pages each own the dialog that creates a
 * record. Nothing here creates a new entry point.
 */
const QUICK_ACTIONS = [
  { href: '/income', label: 'Add Income', icon: TrendingUp },
  { href: '/expenses', label: 'Add Expense', icon: TrendingDown },
  { href: '/invoices/new', label: 'New Invoice', icon: FileText },
  { href: '/customers', label: 'Add Customer', icon: UserPlus },
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  /**
   * Set when the dashboard request itself failed.
   *
   * Kept strictly separate from "no records yet": a failed request and an empty
   * business are different situations, and showing the onboarding empty state
   * after a 500 would tell the user their data is gone.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Displayable logo URL.
   *
   * Resolved through the same helper the sidebar uses, so both surfaces agree
   * on what a logo is: an inline data URL is returned as-is, a legacy object
   * key is exchanged for a signed read URL, and anything unusable becomes null
   * so the initials fallback takes over. No new upload path, API or schema.
   */
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const fetchDashboard = () => {
    Promise.all([
      // The status is checked rather than parsing whatever came back, so only a
      // genuinely successful response can drive the empty state.
      fetch('/api/dashboard').then(async (r: Response) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
      fetch('/api/company').then((r: any) => (r.ok ? r.json() : null)),
    ])
      .then(([d, c]: any) => {
        setData(d);
        setCompany(c);
        setLoadError(null);
      })
      .catch(() => {
        setData(null);
        setLoadError('Could not load your dashboard. Please try again.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    let active = true;
    resolveStoredFileUrl(company?.logoUrl).then((url: string | null) => {
      if (active) setLogoUrl(url);
    });
    return () => { active = false; };
  }, [company?.logoUrl]);

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

  // Only a response that actually arrived may say the business is empty.
  const isEmpty = data !== null && data.hasRecords === false;

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
      <div className="flex items-center gap-3">
        {/* Shown only when there is something to show: with no logo and no
            company name the badge would be an empty grey square, so the
            heading simply sits on its own as before. */}
        {logoUrl || company?.name ? (
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="font-display text-sm font-bold text-muted-foreground">
                {getCompanyInitials(company?.name)}
              </span>
            )}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight truncate">
            {company?.name ? `Welcome back, ${company.name}` : 'Welcome back'}
          </h1>
          <p className="text-muted-foreground">Your business at a glance this month</p>
        </div>
      </div>

      {loadError ? (
        /* The request failed. This is not the same as having no records, so it
           gets its own state and a way to retry. */
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">Could not load your dashboard</h3>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchDashboard(); }}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isEmpty ? (
        /* A business with no invoices, income or expenses at all. Five zeroed
           cards here read as "you earned nothing" rather than "you have not
           entered anything yet". */
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">No financial records yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your revenue, expenses and upcoming activity will appear here once you record your first
              invoice, income or expense.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/invoices/new">Create Invoice</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/income">Add Income</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/expenses">Add Expense</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Metrics per currency. Unchanged: same values, same grouping, same
          formatting — only hidden while there is nothing recorded to show. */}
      {!loadError && !isEmpty && displayCurrencies.map((cur) => {
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

      {/* Bank balances and anything still to reconcile. Renders nothing at all
          for a company with no bank accounts, so this is additive. */}
      {!loadError && !isEmpty ? <BankingSummaryCard /> : null}

      {/*
        Quick Actions.

        Every action is a link to the screen that already owns that flow — the
        dashboard does not host its own copies. Opening those dialogs from here
        would mean deep-link state on four separate pages, which is more
        machinery than four links are worth.

        Hidden in the error and empty states for the same reason the metrics
        are: the empty state already offers these actions, and repeating them
        directly below would be two sets of buttons doing the same thing.
      */}
      {!loadError && !isEmpty ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.href}
                    variant="outline"
                    asChild
                    className="h-auto justify-start gap-2 px-3 py-2.5 font-normal"
                  >
                    <Link href={action.href}>
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{action.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Activity Feed */}
      {!loadError && !isEmpty ? (
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
                <div key={activity?.id} className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {getActivityIcon(activity?.type ?? '')}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{activity?.title ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{activity?.subtitle ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
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
      ) : null}
    </div>
  );
}

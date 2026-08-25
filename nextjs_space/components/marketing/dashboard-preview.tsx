import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A static composition of the product's own visual language, built from the
 * same tokens and patterns as the real dashboard.
 *
 * All figures below are fictional sample data used for illustration. They are
 * not customer data and do not represent any real business.
 */

const METRICS = [
  { label: 'Revenue', value: '18,420.00', currency: 'EUR', tone: 'up' as const, delta: 'This month' },
  { label: 'Expenses', value: '6,180.50', currency: 'EUR', tone: 'down' as const, delta: 'This month' },
  { label: 'Outstanding', value: '4,950.00', currency: 'EUR', tone: 'flat' as const, delta: '3 invoices' },
];

const ROWS = [
  { number: 'INV-0042', client: 'Northwind Studio', amount: '2,400.00', currency: 'EUR', status: 'Paid' },
  { number: 'INV-0041', client: 'Harbour & Co.', amount: '1,750.00', currency: 'EUR', status: 'Sent' },
  { number: 'INV-0040', client: 'Meridian Labs', amount: '800.00', currency: 'EUR', status: 'Overdue' },
];

const STATUS_STYLES: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  Sent: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
  Overdue: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
};

export function DashboardPreview() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-lg"
      role="img"
      aria-label="Preview of the FinanceFlow dashboard showing revenue, expenses, outstanding balance and a list of recent invoices. Sample data."
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Dashboard
        </span>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {/* Metrics */}
        <div className="grid gap-3 sm:grid-cols-3">
          {METRICS.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                {metric.tone === 'up' ? (
                  <ArrowDownLeft aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : metric.tone === 'down' ? (
                  <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                ) : (
                  <CalendarClock aria-hidden="true" className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                )}
              </div>
              <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-foreground">
                <span className="text-sm text-muted-foreground">&euro;</span>
                {metric.value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{metric.delta}</p>
            </div>
          ))}
        </div>

        {/* Invoice table */}
        <div className="rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">Recent invoices</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Sample data
            </p>
          </div>
          <ul className="divide-y divide-border">
            {ROWS.map((row) => (
              <li key={row.number} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{row.number}</p>
                  <p className="truncate text-sm font-medium text-foreground">{row.client}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                      STATUS_STYLES[row.status]
                    )}
                  >
                    {row.status}
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                    &euro;{row.amount}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

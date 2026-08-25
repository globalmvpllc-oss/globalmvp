'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Section, SectionHeading } from '@/components/marketing/section';
import { cn } from '@/lib/utils';

/**
 * Product showcase. Every figure below is fictional sample data used to
 * illustrate the interface; none of it represents a real business.
 */

const INVOICE_ROWS = [
  { number: 'INV-0042', client: 'Northwind Studio', due: 'Mar 14', amount: '2,400.00', status: 'Paid' },
  { number: 'INV-0041', client: 'Harbour & Co.', due: 'Mar 22', amount: '1,750.00', status: 'Sent' },
  { number: 'INV-0040', client: 'Meridian Labs', due: 'Mar 02', amount: '800.00', status: 'Overdue' },
  { number: 'INV-0039', client: 'Foxglove Media', due: 'Feb 28', amount: '3,120.00', status: 'Paid' },
];

const PAYMENT_ROWS = [
  { ref: 'Bank transfer', against: 'INV-0042', date: 'Mar 12', amount: '2,400.00' },
  { ref: 'Bank transfer', against: 'INV-0039', date: 'Feb 26', amount: '1,560.00' },
  { ref: 'Card', against: 'INV-0039', date: 'Feb 20', amount: '1,560.00' },
];

const STATUS_STYLES: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  Sent: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
  Overdue: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Sample data
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function ProductPreview() {
  return (
    <Section className="border-b border-border" aria-labelledby="preview-heading">
      <SectionHeading
        id="preview-heading"
        eyebrow="A look inside"
        title="Screens you will actually use"
        description="No dashboards full of charts you will never open. Just the three places most of the work happens."
      />

      <div className="mt-14">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mx-auto grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-8">
            <Frame label="Financial overview">
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {[
                  { label: 'Revenue this month', value: '18,420.00' },
                  { label: 'Expenses this month', value: '6,180.50' },
                  { label: 'Outstanding', value: '4,950.00' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
                      <span className="text-sm text-muted-foreground">&euro;</span>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
            </Frame>
          </TabsContent>

          <TabsContent value="invoices" className="mt-8">
            <Frame label="Invoices">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Sample list of invoices with client, due date, amount and status</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">Invoice</th>
                    <th scope="col" className="px-5 py-3 font-medium">Client</th>
                    <th scope="col" className="px-5 py-3 font-medium">Due</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {INVOICE_ROWS.map((row) => (
                    <tr key={row.number}>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.number}</td>
                      <td className="px-5 py-3 font-medium text-foreground">{row.client}</td>
                      <td className="px-5 py-3 text-muted-foreground">{row.due}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">&euro;{row.amount}</td>
                      <td className="px-5 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', STATUS_STYLES[row.status])}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Frame>
          </TabsContent>

          <TabsContent value="payments" className="mt-8">
            <Frame label="Payments">
              <table className="w-full min-w-[460px] text-sm">
                <caption className="sr-only">Sample list of payments recorded against invoices</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">Method</th>
                    <th scope="col" className="px-5 py-3 font-medium">Applied to</th>
                    <th scope="col" className="px-5 py-3 font-medium">Date</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PAYMENT_ROWS.map((row, i) => (
                    <tr key={`${row.against}-${i}`}>
                      <td className="px-5 py-3 text-foreground">{row.ref}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.against}</td>
                      <td className="px-5 py-3 text-muted-foreground">{row.date}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">&euro;{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Frame>
          </TabsContent>
        </Tabs>
      </div>
    </Section>
  );
}

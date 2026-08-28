'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Section, SectionHeading } from '@/components/marketing/section';
import { useI18n } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/lib/i18n';

/**
 * Product showcase. Every figure below is fictional sample data used to
 * illustrate the interface; none of it represents a real business. Client
 * names, invoice numbers, dates and amounts are left as-is in every locale —
 * only the labels the product owns are translated.
 */

const INVOICE_ROWS: Array<{
  number: string;
  client: string;
  due: string;
  amount: string;
  status: TranslationKey;
}> = [
  { number: 'INV-0042', client: 'Northwind Studio', due: 'Mar 14', amount: '2,400.00', status: 'landing.preview.statusPaid' },
  { number: 'INV-0041', client: 'Harbour & Co.', due: 'Mar 22', amount: '1,750.00', status: 'landing.preview.statusSent' },
  { number: 'INV-0040', client: 'Meridian Labs', due: 'Mar 02', amount: '800.00', status: 'landing.preview.statusOverdue' },
  { number: 'INV-0039', client: 'Foxglove Media', due: 'Feb 28', amount: '3,120.00', status: 'landing.preview.statusPaid' },
];

const PAYMENT_ROWS: Array<{ ref: TranslationKey; against: string; date: string; amount: string }> = [
  { ref: 'landing.tour.methodBankTransfer', against: 'INV-0042', date: 'Mar 12', amount: '2,400.00' },
  { ref: 'landing.tour.methodBankTransfer', against: 'INV-0039', date: 'Feb 26', amount: '1,560.00' },
  { ref: 'landing.tour.methodCard', against: 'INV-0039', date: 'Feb 20', amount: '1,560.00' },
];

const STATUS_STYLES: Record<string, string> = {
  'landing.preview.statusPaid':
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  'landing.preview.statusSent':
    'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
  'landing.preview.statusOverdue':
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {t('landing.preview.sampleData')}
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function ProductPreview() {
  const { t } = useI18n();

  const METRICS: Array<{ label: TranslationKey; value: string }> = [
    { label: 'landing.tour.revenueThisMonth', value: '18,420.00' },
    { label: 'landing.tour.expensesThisMonth', value: '6,180.50' },
    { label: 'landing.tour.outstanding', value: '4,950.00' },
  ];

  return (
    <Section className="border-b border-border" aria-labelledby="preview-heading">
      <SectionHeading
        id="preview-heading"
        eyebrow={t('landing.tour.eyebrow')}
        title={t('landing.tour.title')}
        description={t('landing.tour.description')}
      />

      <div className="mt-14">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mx-auto grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="dashboard">{t('landing.tour.tabDashboard')}</TabsTrigger>
            <TabsTrigger value="invoices">{t('landing.tour.tabInvoices')}</TabsTrigger>
            <TabsTrigger value="payments">{t('landing.tour.tabPayments')}</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-8">
            <Frame label={t('landing.tour.frameOverview')}>
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {METRICS.map((m) => (
                  <div key={m.label} className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs text-muted-foreground">{t(m.label)}</p>
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
            <Frame label={t('landing.tour.tabInvoices')}>
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">{t('landing.tour.captionInvoices')}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colInvoice')}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colClient')}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colDue')}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t('landing.tour.colAmount')}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colStatus')}</th>
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
                          {t(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Frame>
          </TabsContent>

          <TabsContent value="payments" className="mt-8">
            <Frame label={t('landing.tour.tabPayments')}>
              <table className="w-full min-w-[460px] text-sm">
                <caption className="sr-only">{t('landing.tour.captionPayments')}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colMethod')}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colAppliedTo')}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t('landing.tour.colDate')}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t('landing.tour.colAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PAYMENT_ROWS.map((row, i) => (
                    <tr key={`${row.against}-${i}`}>
                      <td className="px-5 py-3 text-foreground">{t(row.ref)}</td>
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

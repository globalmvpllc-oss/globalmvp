'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, Printer, Scroll, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currencies';
import { formatCalendarDate } from '@/lib/calendar-date';
import { useCompany } from '@/hooks/use-company';
import { useI18n } from '@/components/i18n-provider';
import { resolveStoredFileUrl } from '@/lib/company-identity';
import { generateSinglePdf } from '@/lib/bulk-pdf';
import { generateStatementHtml } from '@/lib/statement-html';
import type { CurrencyStatement, MovementKind, StatementRow } from '@/lib/statement-ledger';
import type { Reconciliation } from '@/lib/statement-sources';
import { paymentMethodLabelKey } from '@/lib/validation';
import type { TranslationKey } from '@/lib/i18n';

/**
 * The running account ledger, shared by the customer and vendor detail pages.
 *
 * One component for both sides so the two screens cannot drift into looking
 * like two products. Only the wording differs: the balance on a customer
 * account is what they owe you, on a vendor account what you owe them, and the
 * sign convention in the API is already the same for both.
 *
 * Four distinct states, never collapsed into one: loading, an error (with a way
 * to retry), an account that has never moved, and a date window that happens to
 * be empty on an account that has. The last two look similar and mean opposite
 * things — the second still carries a balance.
 */

interface StatementPayload {
  party: {
    kind: 'customer' | 'vendor';
    name: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    taxId: string | null;
  };
  currencies: string[];
  byCurrency: Record<string, CurrencyStatement>;
  hasMovements: boolean;
  reconciliation: Record<string, Reconciliation>;
  truncated: boolean;
}

const MOVEMENT_LABEL: Record<MovementKind, TranslationKey> = {
  invoice: 'statement.kind.invoice',
  expense: 'statement.kind.expense',
  income: 'statement.kind.income',
  payment: 'statement.kind.payment',
  settlement: 'statement.kind.settlement',
};

/** Credits are the money coming back; they read green, debits neutral. */
function kindTone(kind: MovementKind): string {
  return kind === 'payment' || kind === 'settlement'
    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
    : 'bg-muted text-muted-foreground';
}

export function AccountStatement({
  endpoint,
  kind,
  fileNameBase,
}: {
  /** Statement endpoint for this account, without a query string. */
  endpoint: string;
  kind: 'customer' | 'vendor';
  /** Basis for the downloaded file name. */
  fileNameBase: string;
}) {
  const { t, fill } = useI18n();
  const company = useCompany();

  const [data, setData] = useState<StatementPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Draft values in the inputs; `applied` is what the last request actually
  // used, so the document footer cannot claim a period the figures are not for.
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const load = useCallback(
    async (range: { from: string; to: string }) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (range.from) query.set('from', range.from);
        if (range.to) query.set('to', range.to);
        const url = query.toString() ? `${endpoint}?${query}` : endpoint;

        const res = await fetch(url);
        if (!res.ok) {
          // An error body is `{ error: ... }`, which is truthy — rendering it as
          // a statement would show an empty ledger and a zero balance, which is
          // a different and much more alarming claim than "this did not load".
          const body = await res.json().catch(() => null);
          setData(null);
          setError(typeof body?.error === 'string' ? body.error : t('statement.error'));
          return;
        }
        setData(await res.json());
        setError(null);
      } catch {
        setData(null);
        setError(t('statement.errorNetwork'));
      } finally {
        setLoading(false);
      }
    },
    [endpoint, t]
  );

  useEffect(() => {
    load({ from: '', to: '' });
  }, [load]);

  const applyRange = () => {
    if (fromDraft && toDraft && toDraft <= fromDraft) {
      toast.error(t('statement.rangeInvalid'));
      return;
    }
    const next = { from: fromDraft, to: toDraft };
    setApplied(next);
    load(next);
  };

  const clearRange = () => {
    setFromDraft('');
    setToDraft('');
    const next = { from: '', to: '' };
    setApplied(next);
    load(next);
  };

  // A payment row carries the stored method code; every other row carries text
  // the user or the document supplied, which is shown as it is.
  const referenceLabel = (row: StatementRow): string =>
    row.kind === 'payment' ? t(paymentMethodLabelKey(row.reference)) : row.reference;

  const buildHtml = async (): Promise<string> => {
    if (!data) return '';
    const logoDataUrl = await resolveStoredFileUrl(company?.logoUrl).catch(() => null);
    return generateStatementHtml({
      party: data.party,
      company,
      logoDataUrl,
      sections: data.currencies
        .map((currency) => data.byCurrency[currency])
        .filter(Boolean)
        // Payment methods are stored codes; the printed document gets the same
        // translated label the table shows rather than 'bank_transfer'.
        .map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({ ...row, reference: referenceLabel(row) })),
        })),
      labels: {
        title: t('statement.title'),
        statementFor: t('statement.statementFor'),
        issued: t('statement.issued'),
        period: t('statement.periodLabel'),
        allTime: t('statement.allTime'),
        date: t('statement.date'),
        type: t('statement.type'),
        reference: t('statement.reference'),
        debit: t('statement.debit'),
        credit: t('statement.credit'),
        balance: t('statement.balance'),
        opening: t('statement.opening'),
        closing: t('statement.closing'),
        periodDebit: t('statement.periodDebit'),
        periodCredit: t('statement.periodCredit'),
        empty: t('statement.emptyWindow'),
        kind: {
          invoice: t('statement.kind.invoice'),
          expense: t('statement.kind.expense'),
          income: t('statement.kind.income'),
          payment: t('statement.kind.payment'),
          settlement: t('statement.kind.settlement'),
        },
      },
      formatAmount: (amount, currency) => formatCurrency(amount, currency),
      range: { from: applied.from || null, to: applied.to || null },
    });
  };

  /**
   * Printing is always available and is used automatically when the PDF service
   * is not configured — the same fallback the invoice page has, for the same
   * reason: a bookkeeping product must be able to produce a document without
   * depending on a third-party key.
   */
  const printStatement = async () => {
    const html = await buildHtml();
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) {
      toast.error(t('statement.pdfPopupBlocked'));
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => win.print();
    if (win.document.readyState === 'complete') win.print();
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const html = await buildHtml();
      if (!html) return;

      // Exactly the flow the invoice download and the bulk ZIP use — same
      // endpoint, same options, same polling.
      const outcome = await generateSinglePdf(html);

      if ('bytes' in outcome) {
        const blob = new Blob([outcome.bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${fileNameBase}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(t('statement.pdfDownloaded'));
        return;
      }

      if (outcome.reason === 'not-configured') {
        toast.message(t('statement.pdfOpeningPrint'), {
          description: t('statement.pdfNotConfigured'),
        });
        await printStatement();
        return;
      }

      toast.error(t('statement.pdfFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <CardTitle className="text-base">{t('statement.title')}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {kind === 'customer' ? t('statement.customerSubtitle') : t('statement.vendorSubtitle')}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={printStatement} disabled={!data}>
          <Printer className="mr-2 h-4 w-4" />
          {t('statement.print')}
        </Button>
        <Button variant="outline" size="sm" onClick={downloadPdf} disabled={!data || pdfBusy}>
          <Download className="mr-2 h-4 w-4" />
          {pdfBusy ? t('statement.preparing') : t('statement.downloadPdf')}
        </Button>
      </div>
    </div>
  );

  const filters = (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-3">
      <div className="space-y-1">
        <Label htmlFor="statement-from" className="text-xs">
          {t('statement.from')}
        </Label>
        <Input
          id="statement-from"
          type="date"
          className="w-40"
          value={fromDraft}
          onChange={(e: any) => setFromDraft(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="statement-to" className="text-xs">
          {t('statement.to')}
        </Label>
        <Input
          id="statement-to"
          type="date"
          className="w-40"
          value={toDraft}
          onChange={(e: any) => setToDraft(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={applyRange} disabled={loading}>
        {t('statement.apply')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={clearRange}
        disabled={loading || (!applied.from && !applied.to && !fromDraft && !toDraft)}
      >
        {t('statement.clear')}
      </Button>
    </div>
  );

  const renderSection = (section: CurrencyStatement) => {
    const reconciliation = data?.reconciliation?.[section.currency];
    const negative = Number(section.closing) < 0;

    return (
      <div key={section.currency} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {section.currency}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {t('statement.opening')}{' '}
              <span className="font-mono text-foreground">
                {formatCurrency(section.opening, section.currency)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t('statement.closing')}{' '}
              <span
                className={`font-mono font-bold ${negative ? 'text-green-600' : 'text-amber-600'}`}
              >
                {formatCurrency(section.closing, section.currency)}
              </span>
            </span>
          </div>
        </div>

        {section.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('statement.emptyWindow')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('statement.emptyWindowHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">{t('statement.date')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('statement.type')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('statement.reference')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('statement.debit')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('statement.credit')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('statement.balance')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-muted/20 text-muted-foreground">
                  <td className="px-3 py-2" colSpan={5}>
                    {t('statement.opening')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrency(section.opening, section.currency)}
                  </td>
                </tr>
                {section.rows.map((row: StatementRow) => {
                  const cell = (
                    <>
                      <span className="block">{referenceLabel(row)}</span>
                      {row.description && (
                        <span className="block text-xs text-muted-foreground">
                          {row.description}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatCalendarDate(row.date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge className={kindTone(row.kind)}>{t(MOVEMENT_LABEL[row.kind])}</Badge>
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        {row.href ? (
                          <Link href={row.href} className="hover:underline">
                            {cell}
                          </Link>
                        ) : (
                          cell
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {row.debit === '0.00'
                          ? ''
                          : formatCurrency(row.debit, section.currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-green-600">
                        {row.credit === '0.00'
                          ? ''
                          : formatCurrency(row.credit, section.currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold">
                        {formatCurrency(row.balance, section.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground" colSpan={3}>
                    {t('statement.periodDebit')} / {t('statement.periodCredit')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                    {formatCurrency(section.debitTotal, section.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-green-600">
                    {formatCurrency(section.creditTotal, section.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold">
                    {formatCurrency(section.closing, section.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {negative && <p className="text-xs text-muted-foreground">{t('statement.inCredit')}</p>}

        {reconciliation && <ReconciliationNote reconciliation={reconciliation} currency={section.currency} />}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>{heading}</CardHeader>
      <CardContent className="space-y-5">
        {filters}

        {data?.truncated && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('statement.truncated')}</span>
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i: number) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => load(applied)}>
              {t('statement.retry')}
            </Button>
          </div>
        ) : !data?.hasMovements ? (
          <div className="py-10 text-center">
            <Scroll className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="font-medium">{t('statement.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {kind === 'customer'
                ? t('statement.emptyCustomerHint')
                : t('statement.emptyVendorHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {data.currencies
              .map((currency: string) => data.byCurrency[currency])
              .filter(Boolean)
              .map(renderSection)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Explains why the closing balance differs from the Outstanding card above.
 *
 * Silent when the two agree. When they do not, the cause is named rather than
 * left for someone to discover: this statement deliberately leaves off draft
 * and cancelled invoices (which Outstanding counts) and deliberately includes
 * amounts expected but never invoiced (which Outstanding does not).
 */
function ReconciliationNote({
  reconciliation,
  currency,
}: {
  reconciliation: Reconciliation;
  currency: string;
}) {
  const { t, fill } = useI18n();

  const excluded = Number(reconciliation.excludedInvoices);
  const uninvoiced = Number(reconciliation.uninvoicedReceivables);
  const difference = Number(reconciliation.difference);
  if (difference === 0 && excluded === 0 && uninvoiced === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{t('statement.reconcileTitle')}</p>
        {excluded !== 0 && (
          <p>
            {fill('statement.reconcileExcluded', {
              amount: formatCurrency(reconciliation.excludedInvoices, currency),
            })}
          </p>
        )}
        {uninvoiced !== 0 && (
          <p>
            {fill('statement.reconcileUninvoiced', {
              amount: formatCurrency(reconciliation.uninvoicedReceivables, currency),
            })}
          </p>
        )}
        {!reconciliation.reconciles && (
          <p className="text-amber-700 dark:text-amber-400">
            {fill('statement.reconcileMismatch', {
              outstanding: formatCurrency(reconciliation.outstanding, currency),
              balance: formatCurrency(reconciliation.statementBalance, currency),
            })}
          </p>
        )}
      </div>
    </div>
  );
}

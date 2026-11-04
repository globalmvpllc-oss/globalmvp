'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { ExportMenu } from '@/components/export-menu';
import { formatCurrency } from '@/lib/currencies';
import { formatCalendarDate } from '@/lib/calendar-date';
import { QUOTE_STATUSES, quoteStatusBadge } from '@/lib/quote-status';

/** Quotes (teklifler): one list, one clear next step — "New quote". */
export default function QuotesPage() {
  const { t, intl } = useI18n();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/quotes${status === 'ALL' ? '' : `?status=${status}`}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (active) { setQuotes(Array.isArray(d) ? d : []); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('quotes.title')}</h1>
          <p className="text-base text-muted-foreground">{t('quotes.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ExportMenu dataset="quotes" className="w-full sm:w-auto" />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/quotes/new"><Plus className="mr-2 h-4 w-4" /> {t('quotes.new')}</Link>
          </Button>
        </div>
      </div>

      <div className="w-full sm:w-56">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('quotes.allStatuses')}</SelectItem>
            {QUOTE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(quoteStatusBadge(s).labelKey)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : failed ? (
        <Card><CardContent className="py-12 text-center text-base text-muted-foreground">{t('quotes.loadFailed')}</CardContent></Card>
      ) : quotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileSignature className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-40" />
            <h3 className="mb-1 text-lg font-medium">{t('quotes.empty')}</h3>
            <p className="mb-4 text-base text-muted-foreground">{t('quotes.emptyHint')}</p>
            <Button asChild><Link href="/quotes/new"><Plus className="mr-2 h-4 w-4" /> {t('quotes.new')}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => {
            const badge = quoteStatusBadge(q.status);
            return (
              <Link key={q.id} href={`/quotes/${q.id}`} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="text-base font-medium">{q.quoteNumber} · {q.customer?.name ?? ''}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('quotes.validUntil')}: {formatCalendarDate(q.validUntil, 'MMM d, yyyy', intl)}
                        {q.convertedInvoice ? ` · ${t('quotes.invoiceLabel')}: ${q.convertedInvoice.invoiceNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base">{formatCurrency(q.total ?? 0, q.currency ?? 'USD')}</span>
                      <Badge className={badge.color}>{t(badge.labelKey)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

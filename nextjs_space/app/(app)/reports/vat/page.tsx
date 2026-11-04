'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import { ExportMenu } from '@/components/export-menu';
import { formatCurrency } from '@/lib/currencies';
import { ListPdfButton } from '@/components/list-pdf-button';

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offset;
  return {
    from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
  };
}

/**
 * KDV report: VAT on sales (hesaplanan) and VAT on expenses (indirilecek),
 * per rate, and the difference. Plain words, one period at a time.
 */
export default function VatReportPage() {
  const { t } = useI18n();
  const [range, setRange] = useState(monthRange(0));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/reports/vat?from=${range.from}&to=${range.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (active) { setData(d); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to]);

  const rateText = (rate: string) => (rate === '?' ? t('vat.rateUnknown') : `%${rate}`);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label={t('vat.back')}><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{t('vat.title')}</h1>
            <p className="text-base text-muted-foreground">{t('vat.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ExportMenu dataset="vat" from={range.from} to={range.to} className="w-full sm:w-auto" />
          <ListPdfButton kind="vat" params={{ from: range.from, to: range.to }} className="w-full sm:w-auto" />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-end">
          <div className="space-y-1">
            <Label>{t('vat.from')}</Label>
            <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{t('vat.to')}</Label>
            <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRange(monthRange(0))}>{t('vat.thisMonth')}</Button>
            <Button variant="outline" onClick={() => setRange(monthRange(-1))}>{t('vat.lastMonth')}</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : failed || !data ? (
        <Card><CardContent className="py-12 text-center text-base text-muted-foreground">{t('vat.failed')}</CardContent></Card>
      ) : data.currencies.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-base text-muted-foreground">{t('vat.empty')}</CardContent></Card>
      ) : (
        data.currencies.map((cur: any) => {
          const money = (n: string) => formatCurrency(Number(n), cur.currency);
          const net = Number(cur.net);
          return (
            <Card key={cur.currency}>
              <CardHeader><CardTitle className="text-lg">{cur.currency}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">{t('vat.outputTotal')}</p><p className="font-mono text-xl font-semibold">{money(cur.outputTax)}</p></div>
                  <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">{t('vat.inputTotal')}</p><p className="font-mono text-xl font-semibold">{money(cur.inputTax)}</p></div>
                  <div className={`rounded-lg p-4 ${net >= 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <p className="text-sm text-muted-foreground">{net >= 0 ? t('vat.payable') : t('vat.carryForward')}</p>
                    <p className="font-mono text-xl font-semibold">{money(String(Math.abs(net)))}</p>
                  </div>
                </div>
                {[
                  { title: t('vat.output'), lines: cur.output },
                  { title: t('vat.input'), lines: cur.input },
                ].map((section) => (
                  <div key={section.title}>
                    <h3 className="mb-2 text-base font-semibold">{section.title}</h3>
                    {section.lines.length === 0 ? (
                      <p className="text-base text-muted-foreground">{t('vat.none')}</p>
                    ) : (
                      <table className="w-full text-base">
                        <thead><tr className="border-b text-sm text-muted-foreground">
                          <th className="py-2 text-left font-medium">{t('vat.rate')}</th>
                          <th className="py-2 text-right font-medium">{t('vat.base')}</th>
                          <th className="py-2 text-right font-medium">{t('vat.amount')}</th>
                        </tr></thead>
                        <tbody>
                          {section.lines.map((line: any) => (
                            <tr key={line.rate} className="border-b last:border-0">
                              <td className="py-2">{rateText(line.rate)}</td>
                              <td className="py-2 text-right font-mono">{money(line.base)}</td>
                              <td className="py-2 text-right font-mono">{money(line.tax)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
      <p className="text-sm text-muted-foreground">{t('vat.disclaimer')}</p>
    </div>
  );
}

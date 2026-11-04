'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/components/i18n-provider';
import { formatCurrency } from '@/lib/currencies';
import { formatCalendarDate } from '@/lib/calendar-date';
import { lineItemTotals } from '@/components/line-items-editor';
import type { TranslationKey } from '@/lib/i18n';
import { ListPdfButton } from '@/components/list-pdf-button';
import { CanEdit } from '@/components/read-only';

const FREQUENCY_KEYS: Record<string, TranslationKey> = {
  MONTHLY: 'recurring.monthly',
  QUARTERLY: 'recurring.quarterly',
  YEARLY: 'recurring.yearly',
};

/** Recurring invoice templates: what runs when, pause/resume, auto-send. */
export default function RecurringPage() {
  const { t, fill, intl } = useI18n();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch('/api/recurring-invoices');
      setTemplates(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const patch = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/recurring-invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error(t('recurring.saveFailed')); return; }
    toast.success(t('recurring.saved'));
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('recurring.deleteConfirm'))) return;
    const res = await fetch(`/api/recurring-invoices/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error(t('recurring.saveFailed')); return; }
    toast.success(t('recurring.deleted'));
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('recurring.title')}</h1>
          <p className="text-base text-muted-foreground">{t('recurring.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ListPdfButton kind="recurring" className="w-full sm:w-auto" />
          <CanEdit>
          <Button asChild className="w-full sm:w-auto"><Link href="/recurring/new"><Plus className="mr-2 h-4 w-4" /> {t('recurring.new')}</Link></Button>
          </CanEdit>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Repeat className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-40" />
            <h3 className="mb-1 text-lg font-medium">{t('recurring.empty')}</h3>
            <p className="mb-4 text-base text-muted-foreground">{t('recurring.emptyHint')}</p>
            <Button asChild><Link href="/recurring/new"><Plus className="mr-2 h-4 w-4" /> {t('recurring.new')}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((r) => {
            const total = lineItemTotals(
              (r.items ?? []).map((i: any) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discount: Number(i.discount), taxRate: Number(i.taxRate) }))
            ).total;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-medium">{r.name || r.customer?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.customer?.name} · {t(FREQUENCY_KEYS[r.frequency] ?? 'recurring.monthly')} · {formatCurrency(total, r.currency)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.isActive
                          ? fill('recurring.nextRun', { date: formatCalendarDate(r.nextRunDate, 'MMM d, yyyy', intl) })
                          : t('recurring.paused')}
                        {' · '}
                        {fill('recurring.createdCount', { count: r._count?.invoices ?? 0 })}
                      </p>
                    </div>
                    <Badge className={r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                      {r.isActive ? t('recurring.active') : t('recurring.paused')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch id={`active-${r.id}`} checked={r.isActive} onCheckedChange={(v) => patch(r.id, { isActive: v })} />
                      <Label htmlFor={`active-${r.id}`} className="text-base">{t('recurring.activeLabel')}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id={`auto-${r.id}`} checked={r.autoSend} onCheckedChange={(v) => patch(r.id, { autoSend: v })} />
                      <Label htmlFor={`auto-${r.id}`} className="text-base">{t('recurring.autoSend')}</Label>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import { setStockPromoHidden } from '@/lib/stock/promo';
import { useStockPromoHidden } from './stock-promo';

/**
 * Settings → "Kullanım modu": Fatura ve finans / Sadece stok (Avc KolayStok) /
 * İkisi. "Sadece stok" hides the invoice menus and opens KolayStok.
 */
export function UsageModeCard() {
  const { t } = useI18n();
  const [mode, setMode] = useState<string | null>(null);
  const promoHidden = useStockPromoHidden();

  useEffect(() => {
    fetch('/api/company').then((r) => (r.ok ? r.json() : null)).then((c) => c && setMode(c.usageMode ?? 'finance')).catch(() => {});
  }, []);

  const choose = async (next: 'finance' | 'stock' | 'both') => {
    const res = await fetch('/api/stock/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usageMode: next }) });
    if (!res.ok) { toast.error(t('ks.saveFailed')); return; }
    setMode(next);
    toast.success(t('ks.set.saved'));
    if (next === 'stock') window.location.href = '/kolaystok/app';
    else window.location.reload();
  };

  if (mode === null) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" aria-hidden="true" /><CardTitle className="text-lg">{t('ks.mode.title')}</CardTitle></div>
        <CardDescription className="text-base">{t('ks.mode.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {(['finance', 'stock', 'both'] as const).map((m) => (
          <button key={m} type="button" onClick={() => choose(m)} aria-pressed={mode === m}
            className={`h-12 rounded-lg border px-4 text-left text-base ${mode === m ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
            {t(`ks.mode.${m}` as TranslationKey)}
          </button>
        ))}
        {mode === 'finance' && promoHidden !== null && (
          <label className="mt-2 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-base">
            <span>{t('ks.promo.setting')}</span>
            <Switch checked={!promoHidden} onCheckedChange={(on) => setStockPromoHidden(!on)} aria-label={t('ks.promo.setting')} />
          </label>
        )}
      </CardContent>
    </Card>
  );
}

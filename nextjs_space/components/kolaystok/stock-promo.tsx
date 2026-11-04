'use client';

import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/components/i18n-provider';
import { isStockPromoHidden, setStockPromoHidden, STOCK_PROMO_EVENT } from '@/lib/stock/promo';

/** Whether the user chose "Gösterme" on this device (null until read, so nothing flickers). */
export function useStockPromoHidden(): boolean | null {
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => setHidden(isStockPromoHidden());
    read();
    window.addEventListener(STOCK_PROMO_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(STOCK_PROMO_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return hidden;
}

/**
 * Sidebar row "Stok · Yeni" for finance-mode companies. Opens a short intro
 * with "Stok bölümünü aç" (switches the company to "İkisi" and opens Avc
 * KolayStok) and "Gösterme" (hides the row; Settings can bring it back).
 */
export function StockPromoItem({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageMode: 'both' }),
      });
      if (!res.ok) {
        toast.error(t('ks.saveFailed'));
        return;
      }
      onNavigate?.();
      window.location.href = '/kolaystok/app';
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={`${t('ks.promo.nav')} (${t('ks.promo.new')})`}
      >
        <Boxes className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="flex-1">{t('ks.promo.nav')}</span>
            <span className="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">{t('ks.promo.new')}</span>
          </>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Boxes className="h-6 w-6 text-teal-700" aria-hidden="true" />
              {t('ks.promo.title')}
            </DialogTitle>
            <DialogDescription className="text-lg text-foreground">{t('ks.promo.body')}</DialogDescription>
          </DialogHeader>
          <p className="text-base text-muted-foreground">{t('ks.promo.note')}</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="button" size="lg" className="h-12 w-full text-base" disabled={busy} onClick={enable}>
              {t('ks.promo.open')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-base"
              onClick={() => {
                setStockPromoHidden(true);
                setOpen(false);
              }}
            >
              {t('ks.promo.hide')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

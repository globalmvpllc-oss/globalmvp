import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { isStockPromoHidden, showStockPromo, STOCK_PROMO_KEY } from '@/lib/stock/promo';
import { tr } from '@/lib/i18n/tr';
import { en } from '@/lib/i18n/en';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('"Stok · Yeni" row for finance-mode companies', () => {
  it('shows only in "Fatura ve finans" mode, never to an accountant, and not after "Gösterme"', () => {
    expect(showStockPromo({ usageMode: 'finance', readOnly: false, hidden: false })).toBe(true);
    expect(showStockPromo({ usageMode: null, readOnly: false, hidden: false })).toBe(true);
    expect(showStockPromo({ usageMode: 'both', readOnly: false, hidden: false })).toBe(false);
    expect(showStockPromo({ usageMode: 'stock', readOnly: false, hidden: false })).toBe(false);
    expect(showStockPromo({ usageMode: 'finance', readOnly: true, hidden: false })).toBe(false);
    expect(showStockPromo({ usageMode: 'finance', readOnly: false, hidden: true })).toBe(false);
  });

  it('"Gösterme" is remembered on the device', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null };
    expect(isStockPromoHidden(storage)).toBe(false);
    store.set(STOCK_PROMO_KEY, '1');
    expect(isStockPromoHidden(storage)).toBe(true);
  });

  it('the intro text, the "Stok bölümünü aç" button (→ İkisi) and the settings switch are wired', () => {
    expect((tr as Record<string, string>)['ks.promo.body']).toBe('Ürünlerinizi ve stoğunuzu takip edin, stok azalınca uyarı alın.');
    expect((tr as Record<string, string>)['ks.promo.open']).toBe('Stok bölümünü aç');
    expect((tr as Record<string, string>)['ks.promo.new']).toBe('Yeni');
    expect(Object.keys(en).filter((k) => k.startsWith('ks.promo.')).sort()).toEqual(Object.keys(tr).filter((k) => k.startsWith('ks.promo.')).sort());
    const promo = src('components/kolaystok/stock-promo.tsx');
    expect(promo).toContain("JSON.stringify({ usageMode: 'both' })");
    expect(promo).toContain('setStockPromoHidden(true)');
    expect(src('components/kolaystok/usage-mode-card.tsx')).toContain('setStockPromoHidden(!on)');
    const sidebar = src('components/app-sidebar.tsx');
    expect(sidebar.match(/stockPromo=\{/g)).toHaveLength(2); // drawer and desktop sidebar
  });
});

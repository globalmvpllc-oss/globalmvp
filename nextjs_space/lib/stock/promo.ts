/**
 * The "Stok — Yeni" row in the CorpControl sidebar (finance-mode companies).
 * "Gösterme" hides it on this device; Settings can show it again. Kept in the
 * browser so it needs no database change; an event tells the sidebar at once.
 */
export const STOCK_PROMO_KEY = 'cc.stockPromo.hidden';
export const STOCK_PROMO_EVENT = 'cc-stock-promo';

export function isStockPromoHidden(storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  try {
    return storage?.getItem(STOCK_PROMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setStockPromoHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(STOCK_PROMO_KEY, '1');
    else window.localStorage.removeItem(STOCK_PROMO_KEY);
  } catch {
    // Private mode without storage: the row simply stays as it is.
  }
  window.dispatchEvent(new Event(STOCK_PROMO_EVENT));
}

/** The row is offered only to finance-mode companies, and not to an accountant. */
export function showStockPromo(input: { usageMode: string | null | undefined; readOnly: boolean; hidden: boolean }): boolean {
  return (input.usageMode ?? 'finance') === 'finance' && !input.readOnly && !input.hidden;
}

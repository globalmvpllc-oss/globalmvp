import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Stock entry rules (5 Nov 2026): the amount is always positive and the reason
 * decides the direction; large amounts and drops below zero need a yes first;
 * the server enforces the same; Excel refuses negative numbers.
 */

// --- an in-memory product table for enterStock --------------------------------
const db = vi.hoisted(() => ({
  products: [] as Array<{ id: string; companyId: string; code: string; name: string; unit: string; quantity: number; minStock: number; lowAlertAt: Date | null; isActive: boolean }>,
  movements: [] as any[],
  locked: [] as string[],
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => {
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');
      const [id, companyId] = values;
      if (sql.includes('FOR UPDATE')) db.locked.push(id);
      const p = db.products.find((x) => x.id === id && x.companyId === companyId && x.isActive);
      return p ? [{ quantity: String(p.quantity) }] : [];
    },
    stockProduct: {
      findFirst: async ({ where }: any) => db.products.find((x) => x.id === where.productId || (x.id === where.id && x.companyId === where.companyId)) ?? null,
      update: async ({ where, data }: any) => {
        const p = db.products.find((x) => x.id === where.id)!;
        p.quantity += Number(data.quantity.increment);
        return { ...p, quantity: p.quantity, minStock: p.minStock };
      },
      updateMany: async ({ where, data }: any) => {
        const p = db.products.find((x) => x.id === where.id)!;
        if (where.lowAlertAt === null && p.lowAlertAt === null) { p.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
        if (where.lowAlertAt?.not === null && p.lowAlertAt !== null) { p.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
        return { count: 0 };
      },
    },
    stockMovement: {
      create: async ({ data }: any) => { const m = { id: `m${db.movements.length + 1}`, ...data }; db.movements.push(m); return { id: m.id }; },
    },
  };
  return { prisma: { $transaction: async (fn: any) => fn(tx) } };
});

import {
  entryDirection,
  isLargeEntry,
  planEntry,
  sanitizeQuickReasons,
  MANUAL_REASONS,
  INCREASE_REASONS,
  DECREASE_REASONS,
} from '@/lib/stock/rules';
import { enterStock, EntryConfirmationNeeded } from '@/lib/stock/service';
import { checkImportRows } from '@/lib/stock/excel';

const root = path.resolve(__dirname, '../..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf-8');
const actor = { name: 'Depo', userId: 'u1', staffId: null };

beforeEach(() => {
  db.products = [
    { id: 'p1', companyId: 'c1', code: 'A', name: 'Ürün A', unit: 'adet', quantity: 100, minStock: 50, lowAlertAt: null, isActive: true },
    { id: 'p2', companyId: 'c1', code: 'B', name: 'Ürün B', unit: 'adet', quantity: 0, minStock: 5, lowAlertAt: null, isActive: true },
    { id: 'p9', companyId: 'c2', code: 'Z', name: 'Başka firma', unit: 'adet', quantity: 100, minStock: 5, lowAlertAt: null, isActive: true },
  ];
  db.movements = [];
  db.locked = [];
});

describe('the reason decides the direction', () => {
  it('Üretim, Mal kabul and İade add; Satış and Fire take away; Sayım sets', () => {
    expect(entryDirection('production')).toBe('in');
    expect(entryDirection('receipt')).toBe('in');
    expect(entryDirection('return')).toBe('in');
    expect(entryDirection('sale')).toBe('out');
    expect(entryDirection('waste')).toBe('out');
    expect(entryDirection('count')).toBe('set');
  });

  it('system reasons and "other" cannot be picked by hand', () => {
    for (const r of ['other', 'opening', 'reset', 'reset-undo', 'undo', 'hack', null, 5]) expect(entryDirection(r)).toBeNull();
    expect(MANUAL_REASONS).not.toContain('other');
    expect([...MANUAL_REASONS].sort()).toEqual([...INCREASE_REASONS, ...DECREASE_REASONS, 'count'].sort());
  });

  it('works out the change from a positive amount', () => {
    const sale = planEntry(100, 3, 'sale');
    const receipt = planEntry(100, 3, 'receipt');
    const count = planEntry(100, 97, 'count');
    expect(sale.ok && sale.delta.toNumber()).toBe(-3);
    expect(receipt.ok && receipt.delta.toNumber()).toBe(3);
    expect(count.ok && count.delta.toNumber()).toBe(-3);
    expect(count.ok && count.after.toNumber()).toBe(97);
  });
});

describe('only positive amounts', () => {
  it('refuses negative, zero, NaN, Infinity, strings and huge amounts', () => {
    for (const q of [-1, -0.5, 0, Number.NaN, Number.POSITIVE_INFINITY, '5', null, 1e9]) {
      const plan = planEntry(100, q, 'sale');
      expect(plan.ok, String(q)).toBe(false);
    }
  });

  it('a count may be zero ("none left") but never negative', () => {
    expect(planEntry(10, 0, 'count').ok).toBe(true);
    expect(planEntry(10, -1, 'count').ok).toBe(false);
  });

  it('refuses an unknown reason', () => {
    const plan = planEntry(10, 1, 'other');
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.code).toBe('INVALID_REASON');
  });

  it('decimals are fine (kg, metre)', () => {
    const plan = planEntry(10, 2.5, 'sale');
    expect(plan.ok && plan.after.toNumber()).toBe(7.5);
  });
});

describe('"Emin misiniz?" for large amounts', () => {
  it('above 500', () => {
    expect(isLargeEntry(500, 10_000)).toBe(false);
    expect(isLargeEntry(501, 10_000)).toBe(true);
  });

  it('above 3 × the current stock', () => {
    expect(isLargeEntry(300, 100)).toBe(false);
    expect(isLargeEntry(301, 100)).toBe(true);
  });

  it('a single + on an empty product does not ask', () => {
    expect(isLargeEntry(1, 0)).toBe(false);
    const plan = planEntry(0, 1, 'receipt');
    expect(plan.ok && plan.large).toBe(false);
  });

  it('a count to a much higher number asks too', () => {
    const plan = planEntry(100, 431, 'count');
    expect(plan.ok && plan.large).toBe(true);
  });
});

describe('"Stok eksiye düşecek" for drops below zero', () => {
  it('flags a sale bigger than the stock, with the amount below zero', () => {
    const plan = planEntry(100, 120, 'sale');
    expect(plan.ok && plan.negative).toBe(true);
    expect(plan.ok && plan.after.toNumber()).toBe(-20);
  });

  it('exactly to zero is not negative', () => {
    const plan = planEntry(100, 100, 'sale');
    expect(plan.ok && plan.negative).toBe(false);
  });

  it('adding to zero is fine; adding to a stock that stays below zero still warns', () => {
    const plan = planEntry(-5, 1, 'receipt');
    expect(plan.ok && plan.negative).toBe(true); // still below zero after: it says so
    expect(planEntry(0, 1, 'receipt').ok && (planEntry(0, 1, 'receipt') as any).negative).toBe(false);
  });
});

describe('the server enforces the same rules', () => {
  it('a sale takes away; the row is locked first', async () => {
    const r: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 3, reason: 'sale', actor });
    expect(r.quantityAfter).toBe(97);
    expect(db.movements[0]).toMatchObject({ delta: '-3', reason: 'sale' });
    expect(db.locked).toEqual(['p1']);
  });

  it('a receipt adds', async () => {
    const r: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 5, reason: 'receipt', actor });
    expect(r.quantityAfter).toBe(105);
  });

  it('a count sets the stock to the counted amount', async () => {
    const r: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 80, reason: 'count', actor });
    expect(r.quantityAfter).toBe(80);
    expect(db.movements[0]).toMatchObject({ delta: '-20', reason: 'count' });
  });

  it('a count equal to the stock writes nothing', async () => {
    const r: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 100, reason: 'count', actor });
    expect(r).toEqual({ unchanged: true, quantityAfter: 100 });
    expect(db.movements).toHaveLength(0);
  });

  it('a negative amount is refused, nothing written', async () => {
    await expect(enterStock({ companyId: 'c1', productId: 'p1', quantity: -156, reason: 'receipt', actor })).rejects.toThrow('INVALID_QUANTITY');
    await expect(enterStock({ companyId: 'c1', productId: 'p1', quantity: 0, reason: 'sale', actor })).rejects.toThrow('INVALID_QUANTITY');
    expect(db.movements).toHaveLength(0);
    expect(db.products[0].quantity).toBe(100);
  });

  it('a large amount needs confirmation', async () => {
    const attempt = enterStock({ companyId: 'c1', productId: 'p1', quantity: 600, reason: 'receipt', actor });
    await expect(attempt).rejects.toBeInstanceOf(EntryConfirmationNeeded);
    await attempt.catch((e: EntryConfirmationNeeded) => expect(e.details).toMatchObject({ large: true, negative: false, quantity: 600, after: 700, current: 100 }));
    expect(db.movements).toHaveLength(0);
    const ok: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 600, reason: 'receipt', actor, confirmed: true });
    expect(ok.quantityAfter).toBe(700);
  });

  it('a drop below zero needs confirmation, then is allowed', async () => {
    const attempt = enterStock({ companyId: 'c1', productId: 'p2', quantity: 1, reason: 'sale', actor });
    await attempt.catch((e: EntryConfirmationNeeded) => expect(e.details).toMatchObject({ large: false, negative: true, after: -1 }));
    await expect(attempt).rejects.toBeInstanceOf(EntryConfirmationNeeded);
    expect(db.products[1].quantity).toBe(0);
    const ok: any = await enterStock({ companyId: 'c1', productId: 'p2', quantity: 1, reason: 'sale', actor, confirmed: true });
    expect(ok.quantityAfter).toBe(-1);
  });

  it('another company’s product is not found', async () => {
    await expect(enterStock({ companyId: 'c1', productId: 'p9', quantity: 1, reason: 'sale', actor })).rejects.toThrow('NOT_FOUND');
    expect(db.products[2].quantity).toBe(100);
  });
});

describe('the movements route uses the rules', () => {
  const route = src('app/api/stock/movements/route.ts');
  it('goes through enterStock, answers 409 CONFIRM, and checks an older signed change against the reason', () => {
    expect(route).toContain('enterStock(');
    expect(route).not.toMatch(/\bmoveStock\(/);
    expect(route).toContain("code: 'CONFIRM'");
    expect(route).toContain('status: 409');
    expect(route).toContain("direction === 'in' && data.delta > 0");
    expect(route).toContain("direction === 'out' && data.delta < 0");
  });

  it('quick + / − reasons must point the right way', () => {
    expect(src('app/api/stock/settings/route.ts')).toContain('refine(isIncreaseReason)');
    expect(src('app/api/stock/settings/route.ts')).toContain('refine(isDecreaseReason)');
    expect(sanitizeQuickReasons({ plus: 'sale', minus: 'receipt' })).toEqual({ plus: 'receipt', minus: 'sale' });
    expect(sanitizeQuickReasons({ plus: 'return', minus: 'waste' })).toEqual({ plus: 'return', minus: 'waste' });
    expect(sanitizeQuickReasons({ plus: 'other', minus: null })).toEqual({ plus: 'receipt', minus: 'sale' });
  });

  it('the screen has no in/out switch and asks before large or negative entries', () => {
    const home = src('app/kolaystok/app/page.tsx');
    expect(home).not.toContain("setDirection(");
    expect(home).toContain('ks.qty.confirmLarge');
    expect(home).toContain('ks.qty.confirmNegative');
    expect(home).not.toContain('window.confirm');
    expect(home).toContain("replace(/[^0-9.,]/g, '')");
  });
});

describe('Excel refuses negative numbers', () => {
  const row = (stock: string, extra: Record<string, string> = {}) => ({ row: 2, code: 'A', name: 'Ürün A', stock, ...extra });

  it('a negative stock is an error, with its own message', () => {
    for (const v of ['-5', '−5', '- 5', '-0,5']) {
      const result = checkImportRows([row(v) as any], new Set(['A']), null);
      expect(result.rows[0].errors, v).toContain('stock:negative');
      expect(result.errorCount).toBe(1);
    }
  });

  it('negative prices and minimums are refused too', () => {
    const result = checkImportRows([row('5', { salePrice: '-10', minStock: '-1' }) as any], new Set(['A']), null);
    expect(result.rows[0].errors).toEqual(expect.arrayContaining(['salePrice:negative', 'minStock:negative']));
  });

  it('zero and positive stock are fine; an empty cell or "-" means "leave it"', () => {
    expect(checkImportRows([row('0') as any], new Set(['A']), null).rows[0].errors).toEqual([]);
    expect(checkImportRows([row('12,5') as any], new Set(['A']), null).rows[0].values.stock).toBe(12.5);
    expect(checkImportRows([row('-') as any], new Set(['A']), null).rows[0].values.stock).toBeUndefined();
  });

  it('the message exists in both languages', () => {
    expect(src('lib/i18n/tr.ts')).toContain("'ks.imp.err.negative'");
    expect(src('lib/i18n/en.ts')).toContain("'ks.imp.err.negative'");
  });
});

// --- 5 Nov 2026, second round: Üretim adds; layout; labels ---------------------
import { reasonLabelKey } from '@/lib/stock/rules';

describe('Üretim (+) adds to stock from now on', () => {
  it('a production entry adds, through the server rules', async () => {
    const r: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 40, reason: 'production', actor });
    expect(r.quantityAfter).toBe(140);
    expect(db.movements[0]).toMatchObject({ delta: '40', reason: 'production' });
  });

  it('the increasing and decreasing reasons are exactly as agreed, with no "used in production" reason', () => {
    expect([...INCREASE_REASONS]).toEqual(['production', 'receipt', 'return']);
    expect([...DECREASE_REASONS]).toEqual(['sale', 'waste']);
    expect([...MANUAL_REASONS]).toEqual(['production', 'receipt', 'return', 'sale', 'waste', 'count']);
  });

  it('a stored quick − of "production" (from before) falls back to Satış; quick + may be Üretim', () => {
    expect(sanitizeQuickReasons({ plus: 'production', minus: 'production' })).toEqual({ plus: 'production', minus: 'sale' });
  });
});

describe('labels carry the sign; old "Üretim (−)" movements keep their meaning', () => {
  it('names in both languages', () => {
    const tr = src('lib/i18n/tr.ts');
    for (const label of ["'Üretim (+)'", "'Mal kabul (+)'", "'İade (+)'", "'Satış (−)'", "'Fire (−)'", "'Sayım düzeltmesi (=)'", "'Üretim (eski kayıt, −)'"]) expect(tr).toContain(label);
    const en = src('lib/i18n/en.ts');
    for (const label of ["'Production (+)'", "'Sale (−)'", "'Count correction (=)'", "'Production (old entry, −)'"]) expect(en).toContain(label);
  });

  it('an old negative production movement is labelled as the old kind', () => {
    expect(reasonLabelKey('production', -156)).toBe('ks.reason.production-old');
    expect(reasonLabelKey('production', '-156.000')).toBe('ks.reason.production-old');
    expect(reasonLabelKey('production', 40)).toBe('ks.reason.production');
    expect(reasonLabelKey('sale', -3)).toBe('ks.reason.sale');
  });

  it('history, Excel and PDF use the same label helper', () => {
    expect(src('app/kolaystok/app/movements/page.tsx')).toContain('reasonLabelKey(m.reason, m.delta)');
    expect(src('app/api/stock/movements/export/route.ts')).toContain('reasonLabelKey(m.reason, m.delta)');
  });

  it('the sheet: + column green, − column red, = full width at the bottom', () => {
    const home = src('app/kolaystok/app/page.tsx');
    expect(home).toContain('INCREASE_REASONS.map');
    expect(home).toContain('DECREASE_REASONS.map');
    expect(home).toMatch(/bg-emerald-50/);
    expect(home).toMatch(/bg-red-50/);
    expect(home).toContain('col-span-2 h-14');
  });
});

// --- 5 Nov 2026, third round: Sayım düzeltmesi on the home screen uses the count rule ---
import { readdirSync, statSync } from 'fs';

describe('Sayım düzeltmesi (=) asks like the count screen', () => {
  it('a difference above 50 or above half the stock asks; a small one does not', () => {
    const big = planEntry(100, 160, 'count');
    const half = planEntry(10, 4, 'count');
    const small = planEntry(100, 120, 'count');
    expect(big.ok && big.large).toBe(true);
    expect(half.ok && half.large).toBe(true); // the old 500 / 3× rule would not have asked
    expect(small.ok && small.large).toBe(false);
  });

  it('the server refuses an unconfirmed count far from the stock', async () => {
    const attempt = enterStock({ companyId: 'c1', productId: 'p1', quantity: 30, reason: 'count', actor });
    await expect(attempt).rejects.toBeInstanceOf(EntryConfirmationNeeded);
    await attempt.catch((e: EntryConfirmationNeeded) => expect(e.details).toMatchObject({ large: true, current: 100, after: 30 }));
    expect(db.movements).toHaveLength(0);
    const ok: any = await enterStock({ companyId: 'c1', productId: 'p1', quantity: 30, reason: 'count', actor, confirmed: true });
    expect(ok.quantityAfter).toBe(30);
  });

  it('the home screen asks the count question for a count', () => {
    const home = src('app/kolaystok/app/page.tsx');
    expect(home).toContain("entryDirection(reason) === 'set'");
    expect(home).toContain('ks.count.confirmDiff');
  });
});

describe('no browser confirm / alert / prompt anywhere in KolayStok', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, name);
      if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?)$/.test(name)) files.push(rel);
    }
  };
  walk('app/kolaystok');
  walk('components/kolaystok');

  it('every screen uses the in-app question window', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const code = src(f);
      expect(code, f).not.toMatch(/\bwindow\.(confirm|alert|prompt)\s*\(/);
      expect(code, f).not.toMatch(/(^|[^.\w])(confirm|alert|prompt)\s*\(\s*(t\(|fill\(|['"`])/);
    }
  });

  it('the former browser boxes now go through useKsDialog', () => {
    expect(src('app/kolaystok/app/count/page.tsx')).toMatch(/dialog\.confirm\(fill\('ks\.count\.finishConfirm'/);
    expect(src('app/kolaystok/app/count/page.tsx')).toMatch(/dialog\.confirm\(t\('ks\.count\.cancelConfirm'\)/);
    expect(src('app/kolaystok/app/products/[id]/page.tsx')).toContain("dialog.confirm(fill('ks.product.deactivateConfirm'");
    const settings = src('app/kolaystok/app/settings/page.tsx');
    for (const key of ['ks.reset.undoConfirm', 'ks.set.renewConfirm', 'ks.set.signOutConfirm', 'ks.set.removeConfirm']) expect(settings).toContain(key);
    expect(settings).toContain('dialog.askPin(');
    for (const f of ['app/kolaystok/app/page.tsx', 'app/kolaystok/app/count/page.tsx', 'app/kolaystok/app/products/[id]/page.tsx', 'app/kolaystok/app/settings/page.tsx']) {
      expect(src(f), f).toContain('{dialog.element}');
    }
  });

  it('the window: big buttons, PIN digits only and exactly four, texts in both languages', () => {
    const dialog = src('components/kolaystok/ks-dialog.tsx');
    expect(dialog).toContain('h-16');
    expect(dialog).toContain(String.raw`.replace(/\D/g, '').slice(0, 4)`);
    expect(dialog).toContain(String.raw`/^\d{4}$/.test(pin)`);
    const tr = src('lib/i18n/tr.ts');
    const en = src('lib/i18n/en.ts');
    for (const key of ['ks.dialog.yes', 'ks.dialog.removeYes', 'ks.count.finishYes', 'ks.count.cancelYes', 'ks.reset.undoYes', 'ks.set.renewYes', 'ks.set.signOutYes', 'ks.set.newPinFor']) {
      expect(tr, key).toContain(`'${key}'`);
      expect(en, key).toContain(`'${key}'`);
    }
  });
});

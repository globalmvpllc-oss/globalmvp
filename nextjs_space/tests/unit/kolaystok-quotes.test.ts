import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * KolayStok sales quotes and the order picker (5 Nov 2026): totals and VAT,
 * stock taken out once on acceptance, the below-zero question, and that
 * warehouse staff (no prices) reach none of it — on the server too.
 */

const state = vi.hoisted(() => ({
  role: 'manager' as 'manager' | 'staff',
  quotes: [] as any[],
  products: [] as Array<{ id: string; companyId: string; code: string; name: string; unit: string; quantity: number; minStock: number; lowAlertAt: Date | null; isActive: boolean }>,
  movements: [] as any[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stock/actor', async () => {
  const { can } = await vi.importActual<typeof import('@/lib/stock/rules')>('@/lib/stock/rules');
  const { NextResponse } = await import('next/server');
  return {
    requireStockActor: async (permission: any) =>
      can(state.role, permission)
        ? { actor: { companyId: 'c1', role: state.role, kind: 'user', name: 'Yönetici', userId: 'u1', staffId: null, email: 'o@x.test' }, error: null }
        : { actor: null, error: NextResponse.json({ code: 'STOCK_FORBIDDEN' }, { status: 403 }) },
  };
});
vi.mock('@/lib/db', () => {
  const tx: any = {
    quote: {
      findFirst: async ({ where }: any) => {
        const q = state.quotes.find((x) => x.id === where.id && x.companyId === where.companyId && x.source === where.source);
        return q ? { ...q, items: q.items.map((i: any) => ({ ...i })) } : null;
      },
      updateMany: async ({ where, data }: any) => {
        const q = state.quotes.find((x) => x.id === where.id && x.companyId === where.companyId && (where.stockDeductedAt !== null || x.stockDeductedAt === null));
        if (!q) return { count: 0 };
        Object.assign(q, data);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => Object.assign(state.quotes.find((x) => x.id === where.id), data),
    },
    $queryRaw: async (_s: TemplateStringsArray, companyId: string, ids: string[]) =>
      state.products.filter((p) => p.companyId === companyId && p.isActive && ids.includes(p.id)).map((p) => ({ id: p.id, code: p.code, name: p.name, quantity: String(p.quantity) })),
    stockProduct: {
      findFirst: async ({ where }: any) => state.products.find((p) => p.id === where.id && p.companyId === where.companyId) ?? null,
      update: async ({ where, data }: any) => {
        const p = state.products.find((x) => x.id === where.id)!;
        p.quantity += Number(data.quantity.increment);
        return { ...p };
      },
      updateMany: async () => ({ count: 0 }),
    },
    stockMovement: { create: async ({ data }: any) => { state.movements.push(data); return { id: `m${state.movements.length}` }; } },
  };
  return {
    prisma: {
      ...tx,
      // A failed transaction must leave nothing behind: work on copies, keep them only on success.
      $transaction: async (fn: any) => {
        const snapshot = JSON.stringify({ q: state.quotes, p: state.products, m: state.movements });
        try {
          return await fn(tx);
        } catch (e) {
          const back = JSON.parse(snapshot);
          state.quotes = back.q;
          state.products = back.p;
          state.movements = back.m;
          throw e;
        }
      },
    },
  };
});

import { can, exceedsStock, quoteDeductions, quoteTotals, quoteValidUntil, QUOTE_DEFAULT_VALID_DAYS } from '@/lib/stock/rules';
import { setStockQuoteStatus, QuoteStockConfirmationNeeded } from '@/lib/stock/quotes';

const root = path.resolve(__dirname, '../..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf-8');
const actor: any = { companyId: 'c1', role: 'manager', kind: 'user', name: 'Yönetici', userId: 'u1', staffId: null, email: null };

beforeEach(() => {
  state.role = 'manager';
  state.products = [
    { id: 'p1', companyId: 'c1', code: 'PZ001', name: 'Kürek', unit: 'adet', quantity: 100, minStock: 10, lowAlertAt: null, isActive: true },
    { id: 'p2', companyId: 'c1', code: 'PZ002', name: 'Tel', unit: 'adet', quantity: 3, minStock: 1, lowAlertAt: null, isActive: true },
    { id: 'p9', companyId: 'c2', code: 'X', name: 'Başka firma', unit: 'adet', quantity: 100, minStock: 1, lowAlertAt: null, isActive: true },
  ];
  state.movements = [];
  state.quotes = [
    { id: 'q1', companyId: 'c1', source: 'kolaystok', status: 'SENT', quoteNumber: 'TKL-0001', stockDeductedAt: null, items: [{ stockProductId: 'p1', quantity: 5 }, { stockProductId: 'p1', quantity: 2 }] },
    { id: 'q2', companyId: 'c1', source: 'kolaystok', status: 'SENT', quoteNumber: 'TKL-0002', stockDeductedAt: null, items: [{ stockProductId: 'p2', quantity: 5 }] },
    { id: 'q3', companyId: 'c1', source: 'kolaystok', status: 'DRAFT', quoteNumber: 'TKL-0003', stockDeductedAt: null, items: [{ stockProductId: 'p1', quantity: 1 }] },
    { id: 'q9', companyId: 'c2', source: 'kolaystok', status: 'SENT', quoteNumber: 'TKL-0009', stockDeductedAt: null, items: [{ stockProductId: 'p9', quantity: 1 }] },
  ];
});

describe('quote totals', () => {
  it('without VAT: just the total', () => {
    const r = quoteTotals([{ quantity: 2, unitPrice: 1320 }, { quantity: 1, unitPrice: 99.99 }], false);
    expect(r.subtotal.toNumber()).toBe(2739.99);
    expect(r.tax.toNumber()).toBe(0);
    expect(r.total.toNumber()).toBe(2739.99);
  });

  it('with VAT 20 %: subtotal + VAT = total, to the kuruş', () => {
    const r = quoteTotals([{ quantity: 3, unitPrice: 33.33 }], true);
    expect(r.subtotal.toNumber()).toBe(99.99);
    expect(r.tax.toNumber()).toBe(20);
    expect(r.total.toNumber()).toBe(119.99);
  });

  it('a quantity above stock is only a warning', () => {
    expect(exceedsStock(5, 3)).toBe(true);
    expect(exceedsStock(3, 3)).toBe(false);
  });

  it('valid for 15 days by default, 1–365 allowed, the same date in Turkey and in UTC', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    expect(QUOTE_DEFAULT_VALID_DAYS).toBe(15);
    expect(quoteValidUntil(15, now).toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(quoteValidUntil(0, now).toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(quoteValidUntil(9999, now).toISOString().slice(0, 10)).toBe('2027-11-05');
    const tr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(quoteValidUntil(15, now));
    expect(tr).toBe('2026-11-20');
  });

  it('deductions add up the same product and list what goes below zero', () => {
    const plan = quoteDeductions([{ stockProductId: 'a', quantity: 5 }, { stockProductId: 'a', quantity: 2 }, { stockProductId: 'b', quantity: 4 }, { stockProductId: null, quantity: 9 }], new Map([['a', 100], ['b', 3]]));
    expect(plan.moves.map((m) => [m.productId, m.quantity.toNumber()])).toEqual([['a', 7], ['b', 4]]);
    expect(plan.negative.map((n) => [n.productId, n.after.toNumber()])).toEqual([['b', -1]]);
  });
});

describe('accepting a quote takes stock out once', () => {
  it('"Kabul edildi" writes "Satış (−)" with the quote number in the note', async () => {
    const r = await setStockQuoteStatus(actor, 'q1', 'ACCEPTED', false);
    expect(r.status).toBe('ACCEPTED');
    expect(state.products[0].quantity).toBe(93);
    expect(state.movements).toEqual([expect.objectContaining({ productId: 'p1', delta: '-7', reason: 'sale', note: 'Teklif TKL-0001' })]);
    expect(state.quotes[0].stockDeductedAt).toBeInstanceOf(Date);
  });

  it('can never be deducted twice', async () => {
    await setStockQuoteStatus(actor, 'q1', 'ACCEPTED', false);
    state.quotes[0].status = 'SENT'; // even if the status were set back somehow
    await setStockQuoteStatus(actor, 'q1', 'ACCEPTED', false);
    expect(state.products[0].quantity).toBe(93);
    expect(state.movements).toHaveLength(1);
  });

  it('going below zero needs the confirmation; nothing changes until then', async () => {
    await expect(setStockQuoteStatus(actor, 'q2', 'ACCEPTED', false)).rejects.toBeInstanceOf(QuoteStockConfirmationNeeded);
    expect(state.products[1].quantity).toBe(3);
    expect(state.quotes[1]).toMatchObject({ status: 'SENT', stockDeductedAt: null });
    const r = await setStockQuoteStatus(actor, 'q2', 'ACCEPTED', true);
    expect(r.moved).toHaveLength(1);
    expect(state.products[1].quantity).toBe(-2);
  });

  it('"Reddedildi" changes no stock', async () => {
    await setStockQuoteStatus(actor, 'q1', 'REJECTED', false);
    expect(state.quotes[0].status).toBe('REJECTED');
    expect(state.products[0].quantity).toBe(100);
    expect(state.movements).toHaveLength(0);
  });

  it('a draft (not sent) cannot be accepted; another company’s quote is not found', async () => {
    await expect(setStockQuoteStatus(actor, 'q3', 'ACCEPTED', false)).rejects.toThrow('BAD_TRANSITION');
    await expect(setStockQuoteStatus(actor, 'q9', 'ACCEPTED', false)).rejects.toThrow('NOT_FOUND');
    expect(state.products[2].quantity).toBe(100);
  });
});

describe('only the owner and PIN managers: staff get 403 everywhere', () => {
  it('the permission itself', () => {
    expect(can('manager', 'sales.quote')).toBe(true);
    expect(can('manager', 'order.email')).toBe(true);
    expect(can('staff', 'sales.quote')).toBe(false);
    expect(can('staff', 'order.email')).toBe(false);
    expect(can('viewer', 'sales.quote')).toBe(false);
  });

  it('every new route refuses staff', async () => {
    state.role = 'staff';
    const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const id = { params: { id: 'q1' } };
    const calls: Array<[string, () => Promise<Response>]> = [
      ['picker', async () => (await import('@/app/api/stock/picker/route')).GET(new Request('http://x/api/stock/picker?q=pz'))],
      ['orders/vendor', async () => (await import('@/app/api/stock/orders/vendor/route')).POST(new Request('http://x', json({ productId: 'p1', vendorId: 'v1' })))],
      ['customers GET', async () => (await import('@/app/api/stock/customers/route')).GET(new Request('http://x/api/stock/customers'))],
      ['customers POST', async () => (await import('@/app/api/stock/customers/route')).POST(new Request('http://x', json({ name: 'A', email: 'a@b.co' })))],
      ['quotes GET', async () => (await import('@/app/api/stock/quotes/route')).GET()],
      ['quotes POST', async () => (await import('@/app/api/stock/quotes/route')).POST(new Request('http://x', json({ confirmed: true })))],
      ['preview', async () => (await import('@/app/api/stock/quotes/preview/route')).POST(new Request('http://x', json({})))],
      ['pdf', async () => (await import('@/app/api/stock/quotes/[id]/pdf/route')).GET(new Request('http://x'), id)],
      ['send', async () => (await import('@/app/api/stock/quotes/[id]/send/route')).POST(new Request('http://x', json({ confirmed: true })), id)],
      ['status', async () => (await import('@/app/api/stock/quotes/[id]/status/route')).POST(new Request('http://x', json({ status: 'ACCEPTED' })), id)],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect(res.status, name).toBe(403);
    }
    expect(state.products[0].quantity).toBe(100);
    expect(state.quotes[0].status).toBe('SENT');
  });

  it('the below-zero question on acceptance lists code and amount once', () => {
    const page = src('app/kolaystok/app/quotes/page.tsx');
    expect(page).toContain("fill('ks.quote.confirmNegative', { list })");
    expect(src('lib/i18n/tr.ts')).toContain("'ks.quote.confirmNegative': 'Stok eksiye düşecek ({list}). Devam edilsin mi?'");
  });

  it('the menu shows the quote items only with the permission', () => {
    const more = src('app/kolaystok/app/more/page.tsx');
    expect(more).toContain("show: ks.permissions.quotes");
    expect(src('app/kolaystok/app/layout.tsx')).toContain("quotes: can(actor.role, 'sales.quote')");
  });
});

describe('screens', () => {
  it('order: search, add, remove, supplier picker, preview kept', () => {
    const page = src('app/kolaystok/app/orders/page.tsx');
    expect(page).toContain('<ProductPicker');
    expect(page).toContain('ks.order.remove');
    expect(page).toContain('/api/stock/orders/vendor');
    expect(page).toContain('/api/stock/orders/preview');
    expect(page).toContain('confirmed: true');
  });

  it('quote: customer, products with price and over-stock warning, VAT, validity, preview then send', () => {
    const page = src('app/kolaystok/app/quotes/new/page.tsx');
    for (const s of ['/api/stock/customers', '<ProductPicker', 'exceedsStock', 'ks.quote.addVat', 'ks.quote.vatExcluded', 'QUOTE_DEFAULT_VALID_DAYS', '/api/stock/quotes/preview', 'confirmed: true']) expect(page, s).toContain(s);
  });

  it('the quote PDF has a photo column and says when VAT is not included', () => {
    const lib = src('lib/stock/quotes.ts');
    expect(lib).toContain('image: thumbs[i]');
    expect(lib).toContain("t('ks.quote.vatExcluded')");
    expect(lib).toContain('DEFAULT_STOCK_SENDER');
    expect(src('lib/pdf/engine.ts')).toContain('image?: DocLogo | null');
  });

  it('count screen: "Yükleniyor…" and a locked field while opening', () => {
    const page = src('app/kolaystok/app/count/page.tsx');
    expect(page).toContain("t('ks.count.loading')");
    expect(page).toContain('disabled={opening}');
  });

  it('settings: the row is created on first open, so the staff link and its renew button always appear', () => {
    expect(src('app/api/stock/settings/route.ts')).toMatch(/await ensureStockSettings\(actor\.companyId\);\s*\n\s*const \[settings/);
  });

  it('the migration only adds', () => {
    const sql = src('prisma/migrations/20261110120000_kolaystok_quotes/migration.sql').split('-- Rollback')[0];
    // No statement drops, renames, deletes or rewrites data ("ON DELETE SET NULL" on the new key is fine).
    expect(sql).not.toMatch(/^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    expect(sql).not.toMatch(/\bRENAME\b|\bDROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX)\b/i);
    expect(sql).toContain('ADD COLUMN "stockProductId" TEXT');
    expect(sql).toContain('ADD COLUMN "stockDeductedAt" TIMESTAMP(3)');
  });
});

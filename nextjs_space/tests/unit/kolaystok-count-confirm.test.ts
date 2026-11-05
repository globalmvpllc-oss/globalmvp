import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Sayım "Doğru mu?" (5 Nov 2026): a counted number more than 50 units, or more
 * than half the stock, away from the system stock needs a yes first — on the
 * server too. Minus signs and letters are not accepted.
 */

const state = vi.hoisted(() => ({
  products: [] as Array<{ id: string; companyId: string; quantity: number; isActive: boolean }>,
  lines: [] as Array<{ countId: string; productId: string; counted: number }>,
  counts: [] as Array<{ id: string; companyId: string; status: string; position: number }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stock/actor', () => ({
  requireStockActor: async () => ({ actor: { companyId: 'c1', role: 'staff', kind: 'staff', name: 'Depo', userId: null, staffId: 's1' }, error: null }),
}));
vi.mock('@/lib/db', () => {
  const prisma: any = {
    stockCount: {
      findFirst: async ({ where }: any) => state.counts.find((c) => c.id === where.id && c.companyId === where.companyId && c.status === where.status) ?? null,
      update: async ({ where, data }: any) => { const c = state.counts.find((x) => x.id === where.id)!; c.position = data.position; return c; },
    },
    stockProduct: {
      findFirst: async ({ where }: any) => {
        const p = state.products.find((x) => x.id === where.id && x.companyId === where.companyId && x.isActive);
        return p ? { id: p.id, quantity: p.quantity } : null;
      },
    },
    stockCountLine: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.countId_productId;
        const line = state.lines.find((l) => l.countId === key.countId && l.productId === key.productId);
        if (line) line.counted = update.counted;
        else state.lines.push({ countId: create.countId, productId: create.productId, counted: create.counted });
        return {};
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  return { prisma };
});

import { countNeedsConfirmation, signedDifference, COUNT_CONFIRM_UNITS } from '@/lib/stock/rules';
import { PUT } from '@/app/api/stock/counts/[id]/route';

const root = path.resolve(__dirname, '../..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf-8');

const put = (body: unknown) =>
  PUT(new Request('http://x/api/stock/counts/k1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: { id: 'k1' } });

beforeEach(() => {
  state.products = [
    { id: 'p1', companyId: 'c1', quantity: 100, isActive: true },
    { id: 'p2', companyId: 'c1', quantity: 0, isActive: true },
    { id: 'p9', companyId: 'c2', quantity: 100, isActive: true },
  ];
  state.lines = [];
  state.counts = [{ id: 'k1', companyId: 'c1', status: 'open', position: 0 }];
});

describe('when a count asks "Doğru mu?"', () => {
  it('more than 50 units away', () => {
    expect(COUNT_CONFIRM_UNITS).toBe(50);
    expect(countNeedsConfirmation(1050, 1000)).toBe(false);
    expect(countNeedsConfirmation(1051, 1000)).toBe(true);
    expect(countNeedsConfirmation(949, 1000)).toBe(true);
  });

  it('more than half of the stock away', () => {
    expect(countNeedsConfirmation(15, 10)).toBe(false); // 5 = half: not more
    expect(countNeedsConfirmation(16, 10)).toBe(true);
    expect(countNeedsConfirmation(4, 10)).toBe(true);
  });

  it('the same number or a small difference does not ask', () => {
    expect(countNeedsConfirmation(100, 100)).toBe(false);
    expect(countNeedsConfirmation(97, 100)).toBe(false);
    expect(countNeedsConfirmation(0, 0)).toBe(false);
  });

  it('on an empty product any find asks; on a negative stock it compares with the size of the stock', () => {
    expect(countNeedsConfirmation(1, 0)).toBe(true);
    expect(countNeedsConfirmation(0, -4)).toBe(true);
    expect(countNeedsConfirmation(-2, -4)).toBe(false);
  });

  it('the Karadağ case (695 counted, 100 in the system) would have asked', () => {
    expect(countNeedsConfirmation(695, 100)).toBe(true);
  });

  it('shows the difference with its sign', () => {
    expect(signedDifference(120, 100)).toEqual({ value: 20, sign: '+' });
    expect(signedDifference(30, 100)).toEqual({ value: 70, sign: '−' });
    expect(signedDifference(5, 5)).toEqual({ value: 0, sign: '' });
  });
});

describe('the server enforces it on every counted number', () => {
  it('a small difference is saved straight away', async () => {
    const res = await put({ productId: 'p1', counted: 97, position: 1 });
    expect(res.status).toBe(200);
    expect(state.lines).toEqual([{ countId: 'k1', productId: 'p1', counted: 97 }]);
  });

  it('a big difference answers 409 with the numbers and saves nothing', async () => {
    const res = await put({ productId: 'p1', counted: 695, position: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONFIRM_COUNT', counted: 695, system: 100, difference: 595 });
    expect(state.lines).toHaveLength(0);
    expect(state.counts[0].position).toBe(0);
  });

  it('after a yes it is saved', async () => {
    const res = await put({ productId: 'p1', counted: 695, position: 1, confirmed: true });
    expect(res.status).toBe(200);
    expect(state.lines[0].counted).toBe(695);
  });

  it('a minus number, text, or a number sent as text is refused', async () => {
    for (const counted of [-5, '12', 'abc', null, Number.NaN]) {
      const res = await put({ productId: 'p1', counted, position: 1, confirmed: true });
      expect(res.status, String(counted)).toBe(400);
    }
    expect(state.lines).toHaveLength(0);
  });

  it('another company’s product is not found, and its stock is never revealed', async () => {
    const res = await put({ productId: 'p9', counted: 500, position: 1 });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('100');
  });
});

describe('the count screen', () => {
  const page = src('app/kolaystok/app/count/page.tsx');
  it('accepts digits, dot and comma only — no minus, no letters', () => {
    expect(page).toContain("replace(/[^0-9.,]/g, '')");
    expect(page).toContain('/^\\d+([.,]\\d+)?$/');
  });

  it('asks with the server’s numbers and resends only after a yes', () => {
    expect(page).toContain("d?.code !== 'CONFIRM_COUNT'");
    expect(page).toContain('ks.count.confirmDiff');
    expect(page).toContain('send(true)');
  });

  it('the question in both languages', () => {
    expect(src('lib/i18n/tr.ts')).toContain("'ks.count.confirmDiff': 'Sayılan: {counted}, sistemde: {system}, fark: {diff}. Doğru mu?'");
    expect(src('lib/i18n/en.ts')).toContain("'ks.count.confirmDiff'");
  });
});

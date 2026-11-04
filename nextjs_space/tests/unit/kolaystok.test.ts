import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import Decimal from 'decimal.js';

// --- mocks for the actor and the stock service ---------------------------
const state = vi.hoisted(() => ({
  session: null as any,
  memberRole: 'owner',
  cookie: undefined as string | undefined,
  staffRow: null as any,
  requireError: null as any,
}));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ getServerSession: async () => state.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (k: string) => (k === 'ks_staff' && state.cookie ? { value: state.cookie } : undefined) }),
  headers: () => ({ get: () => null }),
}));
vi.mock('@/lib/auth-helpers', () => ({
  requireUserCompany: async () =>
    state.requireError
      ? { error: state.requireError, user: null, companyId: null, role: null }
      : { error: null, user: { id: 'u1', email: 'o@x.test', name: 'Owner' }, companyId: 'c1', role: state.memberRole },
}));
vi.mock('@/lib/db', () => ({
  prisma: { stockStaff: { findFirst: async () => state.staffRow } },
}));

import {
  afterWrongPin,
  buildSearchKey,
  can,
  compactCode,
  isLocked,
  isValidPin,
  normalizeSearch,
  orderQuantity,
  planMovement,
  searchTerms,
  stockLevel,
  stockRoleForMember,
  MAX_STAFF_PER_COMPANY,
  PIN_LOCK_MINUTES,
  type StockPermission,
} from '@/lib/stock/rules';
import { decodeStaffToken, encodeStaffToken, newStaffToken } from '@/lib/stock/session';
import { requireStockActor } from '@/lib/stock/actor';
import { moveStockTx, serializeProduct } from '@/lib/stock/service';
import { PLAN_LIMITS } from '@/lib/billing/features';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');
const KEY = 'test-secret';

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

// ---------------------------------------------------------------------------

describe('search: Turkish-insensitive, name and code', () => {
  const key = buildSearchKey({ code: 'PZ001', name: 'Alüminyum Pizza Çevirme', size: '20 cm', material: 'Alüminyum' });
  const matches = (q: string) => searchTerms(q).every((t) => key.includes(t));
  it('"cember" finds "Çember"; "pz1" finds PZ001; one or two letters are enough', () => {
    expect(buildSearchKey({ code: 'AR040', name: 'Argon Pasta Çemberi' }).includes(normalizeSearch('cember'))).toBe(true);
    expect(matches('pz1')).toBe(true);
    expect(matches('PZ001')).toBe(true);
    expect(matches('pi')).toBe(true);
    expect(matches('ÇEVİRME')).toBe(true);
    expect(matches('aluminyum 20')).toBe(true);
    expect(matches('pz2')).toBe(false);
  });
  it('normalizes Turkish letters and leading zeros in codes', () => {
    expect(normalizeSearch('İĞNE Şiş Ölçü')).toBe('ignesisolcu');
    expect(compactCode('PZ001')).toBe('pz1');
    expect(compactCode('AB-0120')).toBe('ab120');
  });
});

describe('stock levels and movements', () => {
  it('green above the minimum, yellow at or below, red at zero', () => {
    expect(stockLevel(51, 50)).toBe('ok');
    expect(stockLevel(50, 50)).toBe('low');
    expect(stockLevel(1, 50)).toBe('low');
    expect(stockLevel(0, 50)).toBe('out');
    expect(stockLevel(-2, 50)).toBe('out');
  });
  it('the alert fires once per dip and re-arms above the minimum', () => {
    expect(planMovement({ quantity: 51, minStock: 50, lowAlertAt: null }, -1)).toMatchObject({ fireAlert: true, clearAlert: false });
    expect(planMovement({ quantity: 50, minStock: 50, lowAlertAt: new Date() }, -1)).toMatchObject({ fireAlert: false, clearAlert: false });
    expect(planMovement({ quantity: 49, minStock: 50, lowAlertAt: new Date() }, 5)).toMatchObject({ fireAlert: false, clearAlert: true });
    expect(planMovement({ quantity: 54, minStock: 50, lowAlertAt: null }, -4).fireAlert).toBe(true);
    expect(planMovement({ quantity: 100, minStock: 50 }, 0.5).quantityAfter.toString()).toBe('100.5');
  });
  it('order quantity: target − current, or minimum × 2 − current, never negative', () => {
    expect(orderQuantity({ quantity: 10, minStock: 50, targetStock: 200 }).toNumber()).toBe(190);
    expect(orderQuantity({ quantity: 10, minStock: 50 }).toNumber()).toBe(90);
    expect(orderQuantity({ quantity: 500, minStock: 50 }).toNumber()).toBe(0);
  });
});

describe('moveStockTx: one transaction, atomic increment, alert claimed once', () => {
  function fakeTx(start: { quantity: number; minStock: number; lowAlertAt: Date | null }) {
    const product = { id: 'p1', code: 'PZ001', name: 'Pizza', unit: 'adet', ...start };
    const movements: any[] = [];
    const tx: any = {
      stockProduct: {
        findFirst: async ({ where }: any) => (where.companyId === 'c1' && where.id === 'p1' ? { id: 'p1' } : null),
        update: async ({ data }: any) => {
          product.quantity = new Decimal(product.quantity).plus(data.quantity.increment).toNumber();
          return { ...product };
        },
        updateMany: async ({ where, data }: any) => {
          if (where.lowAlertAt === null && product.lowAlertAt === null) { product.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
          if (where.lowAlertAt?.not === null && product.lowAlertAt !== null) { product.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
          return { count: 0 };
        },
      },
      stockMovement: { create: async ({ data }: any) => { movements.push(data); return { id: `m${movements.length}` }; } },
    };
    return { tx, product, movements };
  }
  const actor = { name: 'Ali', userId: null, staffId: 's1' };

  it('writes the movement with the quantity after, and alerts only on the first dip', async () => {
    const { tx, product, movements } = fakeTx({ quantity: 52, minStock: 50, lowAlertAt: null });
    const a = await moveStockTx(tx, { companyId: 'c1', productId: 'p1', delta: -1, reason: 'sale', actor });
    expect(a).toMatchObject({ quantityAfter: 51, alert: false });
    const b = await moveStockTx(tx, { companyId: 'c1', productId: 'p1', delta: -1, reason: 'sale', actor });
    expect(b.alert).toBe(true);
    const c = await moveStockTx(tx, { companyId: 'c1', productId: 'p1', delta: -5, reason: 'sale', actor });
    expect(c.alert).toBe(false); // same dip: no second alert
    await moveStockTx(tx, { companyId: 'c1', productId: 'p1', delta: 20, reason: 'receipt', actor });
    expect(product.lowAlertAt).toBeNull(); // back above: re-armed
    const d = await moveStockTx(tx, { companyId: 'c1', productId: 'p1', delta: -20, reason: 'sale', actor });
    expect(d.alert).toBe(true); // a new dip alerts again
    expect(movements.map((m) => m.quantityAfter)).toEqual(['51', '50', '45', '65', '45']);
    expect(movements[0]).toMatchObject({ actorName: 'Ali', actorStaffId: 's1', reason: 'sale', companyId: 'c1' });
  });

  it('refuses another company’s product', async () => {
    const { tx } = fakeTx({ quantity: 10, minStock: 5, lowAlertAt: null });
    await expect(moveStockTx(tx, { companyId: 'other', productId: 'p1', delta: 1, reason: 'other', actor })).rejects.toThrow('NOT_FOUND');
  });

  it('the service uses an atomic increment and the alert claim', () => {
    const service = src('lib/stock/service.ts');
    expect(service).toContain('data: { quantity: { increment: delta.toString() } }');
    expect(service).toContain('where: { id: product.id, lowAlertAt: null }');
  });
});

describe('PIN sign-in', () => {
  const now = new Date('2026-11-07T10:00:00Z');
  it('only four digits', () => {
    expect(isValidPin('1234')).toBe(true);
    for (const bad of ['123', '12345', 'abcd', 1234, '12 4']) expect(isValidPin(bad as any)).toBe(false);
  });
  it('five wrong PINs lock for 15 minutes', () => {
    let s = { failedPins: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      s = afterWrongPin(s, now);
      expect(s.lockedUntil).toBeNull();
      expect(s.failedPins).toBe(i);
    }
    s = afterWrongPin(s, now);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(PIN_LOCK_MINUTES * 60_000);
    expect(isLocked(s, now)).toBe(true);
    expect(isLocked(s, new Date(now.getTime() + 16 * 60_000))).toBe(false);
  });
  it('the route checks the lock before the PIN and records failures on the staff row', () => {
    const route = src('app/api/stock/public/pin/route.ts');
    expect(route.indexOf('isLocked(staff, now)')).toBeLessThan(route.indexOf('bcrypt.compare'));
    expect(route).toContain('data: { failedPins: next.failedPins, lockedUntil: next.lockedUntil }');
    expect(route).toContain('maxAge: STAFF_SESSION_MAX_AGE');
    expect(route).toContain('httpOnly: true');
  });
  it('the session cookie is signed, expires after 30 days, and ends when the PIN changes', () => {
    const t0 = 1_800_000_000_000;
    const token = encodeStaffToken(newStaffToken({ id: 's1', companyId: 'c1', sessionVersion: 3 }, t0), KEY);
    expect(decodeStaffToken(token, t0 + 29 * 86_400_000, KEY)).toMatchObject({ sid: 's1', cid: 'c1', v: 3 });
    expect(decodeStaffToken(token, t0 + 31 * 86_400_000, KEY)).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sid: 's1', cid: 'other', v: 3, exp: t0 + 1e9 })).toString('base64url');
    expect(decodeStaffToken(`${forged}.${mac}`, t0, KEY)).toBeNull();
    expect(decodeStaffToken(`${body}.${mac}`, t0, 'other-secret')).toBeNull();
    expect(src('app/api/stock/staff/[id]/route.ts')).toContain('sessionVersion: { increment: 1 }');
  });
});

describe('roles', () => {
  const ALL: StockPermission[] = ['read', 'read.prices', 'move', 'count', 'products.write', 'suppliers.write', 'settings', 'order.email', 'export', 'reset'];
  it('staff: read, move and count only', () => {
    expect(ALL.filter((p) => can('staff', p))).toEqual(['read', 'move', 'count']);
  });
  it('accountant (viewer): reads everything incl. prices, changes nothing', () => {
    expect(ALL.filter((p) => can('viewer', p))).toEqual(['read', 'read.prices', 'export']);
  });
  it('manager: everything', () => {
    expect(ALL.every((p) => can('manager', p))).toBe(true);
  });
  it('CorpControl roles map to stock roles', () => {
    expect(stockRoleForMember('owner')).toBe('manager');
    expect(stockRoleForMember('admin')).toBe('manager');
    expect(stockRoleForMember('accountant')).toBe('viewer');
  });
  it('staff never receive prices or stock value', () => {
    const p = { id: 'p', code: 'C', name: 'N', unit: 'adet', quantity: 10, minStock: 5, purchasePrice: 3, salePrice: 9 };
    const staff = serializeProduct(p, { role: 'staff' }) as any;
    expect(staff.purchasePrice).toBeUndefined();
    expect(staff.salePrice).toBeUndefined();
    expect(staff.stockValue).toBeUndefined();
    expect(JSON.stringify(staff)).not.toContain('"9"');
    expect(serializeProduct(p, { role: 'manager' })).toMatchObject({ purchasePrice: 3, salePrice: 9, stockValue: 30 });
    expect(serializeProduct(p, { role: 'viewer' })).toMatchObject({ salePrice: 9 });
  });
  it('at most five people per company; products per plan: 20 / 1000 / unlimited', () => {
    expect(MAX_STAFF_PER_COMPANY).toBe(5);
    expect(src('app/api/stock/staff/route.ts')).toContain('count >= MAX_STAFF_PER_COMPANY');
    expect([PLAN_LIMITS.free.stockProducts, PLAN_LIMITS.pro.stockProducts, PLAN_LIMITS.business.stockProducts]).toEqual([20, 1000, null]);
    expect(src('app/api/stock/products/route.ts')).toContain("checkPlanLimit(actor.companyId, 'stockProducts')");
  });
});

describe('requireStockActor on the server', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = KEY;
    state.session = null;
    state.cookie = undefined;
    state.staffRow = null;
    state.memberRole = 'owner';
    state.requireError = null;
  });
  const staffCookie = (v = 0) => encodeStaffToken(newStaffToken({ id: 's1', companyId: 'c1', sessionVersion: v }), KEY);

  it('no session and no PIN cookie → 401', async () => {
    expect((await requireStockActor('read')).error?.status).toBe(401);
  });
  it('staff may move stock but not add products, change settings, email suppliers or reset', async () => {
    state.cookie = staffCookie(0);
    state.staffRow = { id: 's1', companyId: 'c1', name: 'Ali', role: 'staff', sessionVersion: 0 };
    expect((await requireStockActor('move')).error).toBeNull();
    for (const p of ['products.write', 'settings', 'order.email', 'reset', 'read.prices', 'suppliers.write'] as StockPermission[]) {
      const r = await requireStockActor(p);
      expect(r.error?.status, p).toBe(403);
    }
  });
  it('a PIN change (new sessionVersion) ends the old session', async () => {
    state.cookie = staffCookie(0);
    state.staffRow = { id: 's1', companyId: 'c1', name: 'Ali', role: 'staff', sessionVersion: 1 };
    expect((await requireStockActor('read')).error?.status).toBe(401);
  });
  it('a staff manager may manage products', async () => {
    state.cookie = staffCookie(2);
    state.staffRow = { id: 's1', companyId: 'c1', name: 'Ayşe', role: 'manager', sessionVersion: 2 };
    const r = await requireStockActor('products.write');
    expect(r.error).toBeNull();
    expect(r.actor).toMatchObject({ kind: 'staff', role: 'manager', companyId: 'c1' });
  });
  it('the accountant reads but cannot move stock', async () => {
    state.session = { user: { id: 'u2' } };
    state.memberRole = 'accountant';
    expect((await requireStockActor('read')).error).toBeNull();
    expect((await requireStockActor('move')).error?.status).toBe(403);
  });
  it('an account session goes through requireUserCompany (accountant read-only rule)', () => {
    expect(src('lib/stock/actor.ts')).toContain('const auth = await requireUserCompany();');
  });
});

describe('every KolayStok API route checks the actor', () => {
  const files = routeFiles(path.join(root, 'app/api/stock'));
  const PUBLIC = ['app/api/stock/public/', 'app/api/stock/logout/'];
  const NEEDS: Array<[RegExp, string]> = [
    [/export async function (POST|PUT|DELETE)[\s\S]*?requireStockActor\('read'\)/, 'a write that only needs read'],
  ];

  it('finds them', () => expect(files.length).toBeGreaterThanOrEqual(12));

  it.each(files.filter((f) => !PUBLIC.some((p) => f.startsWith(p))))('%s', (file) => {
    const text = src(file);
    const handlers = text.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE))/).slice(1);
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) {
      expect(h, `${file}: every handler calls requireStockActor first`).toMatch(/requireStockActor\('[a-z.]+'\)/);
      if (!/^export async function GET/.test(h)) {
        expect(h, `${file}: a change needs more than read`).not.toContain("requireStockActor('read')");
      }
    }
    for (const [re, why] of NEEDS) expect(text, why).not.toMatch(re);
  });

  it('settings, products and staff routes use the right permissions', () => {
    expect(src('app/api/stock/products/route.ts')).toContain("requireStockActor('products.write')");
    expect(src('app/api/stock/products/[id]/route.ts').match(/requireStockActor\('products\.write'\)/g)?.length).toBe(2);
    expect(src('app/api/stock/staff/route.ts').match(/requireStockActor\('settings'\)/g)?.length).toBe(2);
    expect(src('app/api/stock/movements/route.ts')).toContain("requireStockActor('move')");
  });

  it('the middleware lets staff reach KolayStok without an account', () => {
    const mw = src('middleware.ts');
    expect(mw).toContain("pathname.startsWith('/api/stock/')");
    expect(mw).toContain("pathname.startsWith('/kolaystok/')");
  });
});

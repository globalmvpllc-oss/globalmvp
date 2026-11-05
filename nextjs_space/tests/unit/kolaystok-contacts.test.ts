import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * 5 Nov 2026: a supplier with saved addresses ("Şölen Pastanesi", two
 * addresses with a comma) showed "no email" on the order screen and the
 * preview stayed disabled. Cause: the order screen read `orderEmails` /
 * `email` from /api/stock/suppliers, which sends `emails`; and a general
 * address field holding "a, b" was used as one address. Plus the order and
 * quote screen fixes that followed.
 */

const state = vi.hoisted(() => ({
  role: 'manager' as 'manager' | 'staff',
  vendors: [] as Array<{ id: string; companyId: string; name: string; email: string | null; orderEmails: string[]; phone: string | null; notes: string | null }>,
  customers: [] as Array<{ id: string; companyId: string; name: string; companyName: string | null; email: string | null; phone: string | null }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stock/actor', async () => {
  const { can } = await vi.importActual<typeof import('@/lib/stock/rules')>('@/lib/stock/rules');
  const { NextResponse } = await import('next/server');
  return {
    requireStockActor: async (permission: any) =>
      can(state.role, permission)
        ? { actor: { companyId: 'c1', role: state.role, kind: 'user', name: 'Yönetici', userId: 'u1', staffId: null, email: null }, error: null }
        : { actor: null, error: NextResponse.json({ code: 'STOCK_FORBIDDEN' }, { status: 403 }) },
  };
});
vi.mock('@/lib/db', () => ({
  prisma: {
    vendor: {
      findMany: async ({ where }: any) => state.vendors.filter((v) => v.companyId === where.companyId),
      findFirst: async ({ where }: any) => state.vendors.find((v) => v.id === where.id && v.companyId === where.companyId) ?? null,
      updateMany: async ({ where, data }: any) => {
        const v = state.vendors.find((x) => x.id === where.id && x.companyId === where.companyId);
        if (!v) return { count: 0 };
        Object.assign(v, data);
        return { count: 1 };
      },
    },
    customer: {
      updateMany: async ({ where, data }: any) => {
        const c = state.customers.find((x) => x.id === where.id && x.companyId === where.companyId);
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: any) => state.customers.find((x) => x.id === where.id && x.companyId === where.companyId) ?? null,
    },
  },
}));

import { splitEmails, vendorEmails, isEmailAddress, orderGroupBlocker, quoteBlocker } from '@/lib/stock/contacts';
import { GET as suppliersGET } from '@/app/api/stock/suppliers/route';
import { POST as emailsPOST } from '@/app/api/stock/suppliers/[id]/emails/route';
import { PATCH as customerPATCH } from '@/app/api/stock/customers/[id]/route';

const root = path.resolve(__dirname, '../..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf-8');
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  state.role = 'manager';
  state.vendors = [
    { id: 'v1', companyId: 'c1', name: 'Şölen Pastanesi', email: 'siparis@solen.com.tr, muhasebe@solen.com.tr', orderEmails: [], phone: null, notes: null },
    { id: 'v2', companyId: 'c1', name: 'Kalıpçı', email: null, orderEmails: ['a@kalip.com'], phone: null, notes: null },
    { id: 'v3', companyId: 'c1', name: 'Adressiz', email: null, orderEmails: [], phone: null, notes: null },
    { id: 'v9', companyId: 'c2', name: 'Başka firma', email: 'x@y.com', orderEmails: [], phone: null, notes: null },
  ];
  state.customers = [
    { id: 'k1', companyId: 'c1', name: 'Ayşe', companyName: null, email: null, phone: null },
    { id: 'k9', companyId: 'c2', name: 'Başka', companyName: null, email: null, phone: null },
  ];
});

describe('supplier addresses: the bug', () => {
  it('two addresses with a comma in one field are two addresses', () => {
    expect(splitEmails('siparis@solen.com.tr, muhasebe@solen.com.tr')).toEqual(['siparis@solen.com.tr', 'muhasebe@solen.com.tr']);
    expect(splitEmails('A@X.com;b@y.com  c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    expect(splitEmails('not an email, a@x.com, a@x.com')).toEqual(['a@x.com']);
  });

  it('order addresses and the general address are joined, nothing lost', () => {
    expect(vendorEmails({ email: 'siparis@solen.com.tr, muhasebe@solen.com.tr', orderEmails: [] })).toHaveLength(2);
    expect(vendorEmails({ email: 'b@y.com', orderEmails: ['a@x.com'] })).toEqual(['a@x.com', 'b@y.com']);
    expect(vendorEmails({ email: null, orderEmails: [] })).toEqual([]);
    expect(vendorEmails(null)).toEqual([]);
  });

  it('the suppliers list sends `emails` with every address', async () => {
    const res = await suppliersGET();
    const data = await res.json();
    const solen = data.suppliers.find((s: any) => s.id === 'v1');
    expect(solen.emails).toEqual(['siparis@solen.com.tr', 'muhasebe@solen.com.tr']);
    expect(data.suppliers.map((s: any) => s.id)).not.toContain('v9');
  });

  it('the order screen reads `emails` (the field the list sends) and re-reads on return', () => {
    const page = src('app/kolaystok/app/orders/page.tsx');
    expect(page).toContain('emails: Array.isArray(v.emails) ? v.emails : []');
    expect(page).not.toContain('v.orderEmails');
    expect(page).toContain("addEventListener('visibilitychange'");
    expect(page).toContain("cache: 'no-store'");
  });

  it('the order email itself, the order draft and the supplier picker use the same rule', () => {
    expect(src('lib/stock/orders.ts')).toContain('const to = vendorEmails(vendor);');
    expect(src('app/api/stock/orders/route.ts')).toContain('const emails = vendorEmails(v);');
    expect(src('app/api/stock/orders/vendor/route.ts')).toContain('emails: vendorEmails(vendor)');
  });
});

describe('saving an address from the order screen', () => {
  it('adds the typed addresses and keeps the saved ones', async () => {
    const res = await emailsPOST(new Request('http://x', json({ emails: 'yeni@kalip.com' })), { params: { id: 'v2' } });
    expect(res.status).toBe(200);
    expect((await res.json()).emails).toEqual(['a@kalip.com', 'yeni@kalip.com']);
    expect(state.vendors[1]).toMatchObject({ orderEmails: ['a@kalip.com', 'yeni@kalip.com'], email: 'a@kalip.com' });
  });

  it('refuses no valid address, another company’s supplier, and staff', async () => {
    expect((await emailsPOST(new Request('http://x', json({ emails: 'yok' })), { params: { id: 'v3' } })).status).toBe(400);
    expect((await emailsPOST(new Request('http://x', json({ emails: 'a@b.co' })), { params: { id: 'v9' } })).status).toBe(404);
    state.role = 'staff';
    expect((await emailsPOST(new Request('http://x', json({ emails: 'a@b.co' })), { params: { id: 'v3' } })).status).toBe(403);
    expect(state.vendors[2].orderEmails).toEqual([]);
  });

  it('a customer gets an email from the quote card; bad, foreign and staff are refused', async () => {
    const ok = await customerPATCH(new Request('http://x', { ...json({ email: 'Ayse@Ornek.com' }), method: 'PATCH' }), { params: { id: 'k1' } });
    expect(ok.status).toBe(200);
    expect(state.customers[0].email).toBe('ayse@ornek.com');
    expect((await customerPATCH(new Request('http://x', { ...json({ email: 'a@b.co, c@d.co' }), method: 'PATCH' }), { params: { id: 'k1' } })).status).toBe(400);
    expect((await customerPATCH(new Request('http://x', { ...json({ email: 'a@b.co' }), method: 'PATCH' }), { params: { id: 'k9' } })).status).toBe(404);
    state.role = 'staff';
    expect((await customerPATCH(new Request('http://x', { ...json({ email: 'a@b.co' }), method: 'PATCH' }), { params: { id: 'k1' } })).status).toBe(403);
  });

  it('one address means exactly one', () => {
    expect(isEmailAddress('a@b.co')).toBe(true);
    expect(isEmailAddress('a@b.co b@c.co')).toBe(false);
    expect(isEmailAddress('ayse')).toBe(false);
  });
});

describe('why "Preview" is not ready', () => {
  it('order group: no supplier, no address, no quantity', () => {
    expect(orderGroupBlocker({ vendorId: null, vendorName: null, emails: [], lines: [{ quantity: 1 }, { quantity: 2 }, { quantity: 3 }] })).toEqual({ key: 'ks.block.noSupplier', params: { n: 3 } });
    expect(orderGroupBlocker({ vendorId: 'v1', vendorName: 'Şölen Pastanesi', emails: [], lines: [{ quantity: 1 }] })).toEqual({ key: 'ks.block.vendorNoEmail', params: { name: 'Şölen Pastanesi' } });
    expect(orderGroupBlocker({ vendorId: 'v1', vendorName: 'Şölen', emails: ['a@b.co'], lines: [{ quantity: 0 }, { quantity: Number.NaN }] })).toEqual({ key: 'ks.block.noQuantity' });
    expect(orderGroupBlocker({ vendorId: 'v1', vendorName: 'Şölen', emails: ['a@b.co'], lines: [{ quantity: 2 }] })).toBeNull();
  });

  it('quote: no customer, customer without email, no products, bad lines, validity', () => {
    const line = { quantity: 1, price: 10 };
    expect(quoteBlocker({ customer: null, lines: [line], validDays: 15 })?.key).toBe('ks.block.noCustomer');
    expect(quoteBlocker({ customer: { email: null }, lines: [line], validDays: 15 })?.key).toBe('ks.block.customerNoEmail');
    expect(quoteBlocker({ customer: { email: 'a@b.co' }, lines: [], validDays: 15 })?.key).toBe('ks.block.noProducts');
    expect(quoteBlocker({ customer: { email: 'a@b.co' }, lines: [line, { quantity: 0, price: 1 }, { quantity: 1, price: Number.NaN }], validDays: 15 })).toEqual({ key: 'ks.block.badLines', params: { n: 2 } });
    expect(quoteBlocker({ customer: { email: 'a@b.co' }, lines: [line], validDays: 0 })?.key).toBe('ks.block.validDays');
    expect(quoteBlocker({ customer: { email: 'a@b.co' }, lines: [line], validDays: 15 })).toBeNull();
  });

  it('both screens write the reason right above the button, in both languages', () => {
    for (const f of ['app/kolaystok/app/orders/page.tsx', 'app/kolaystok/app/quotes/new/page.tsx']) {
      const page = src(f);
      expect(page, f).toContain('{blocker && <p className="text-lg font-semibold text-amber-800" role="status">');
      expect(page, f).toContain('disabled={');
    }
    for (const key of ['ks.block.noSupplier', 'ks.block.vendorNoEmail', 'ks.block.noQuantity', 'ks.block.noCustomer', 'ks.block.customerNoEmail', 'ks.block.noProducts', 'ks.block.badLines', 'ks.block.validDays']) {
      expect(src('lib/i18n/tr.ts'), key).toContain(`'${key}'`);
      expect(src('lib/i18n/en.ts'), key).toContain(`'${key}'`);
    }
  });
});

describe('order screen and supplier page', () => {
  const page = src('app/kolaystok/app/orders/page.tsx');
  it('an added product goes to the top of its group, is highlighted for 2 seconds, the search empties', () => {
    expect(page).toContain('setLines((prev) => [{ productId: p.id');
    expect(page).toContain('...(prev ?? [])]');
    expect(page).toContain('setTimeout(() => setFlash((f) => (f === p.id ? null : f)), 2000)');
    expect(page).toContain("ks.picker.addedToast");
    expect(src('components/kolaystok/product-picker.tsx')).toContain("setQ('');");
  });

  it('a supplier without an address gets one in the group; unassigned products get one supplier for all', () => {
    expect(page).toContain('/api/stock/suppliers/${encodeURIComponent(vendorId)}/emails');
    expect(page).toContain("t('ks.order.pickSupplierAll')");
    expect(page).toContain('assignVendor(g.lines.map((l) => l.productId), e.target.value)');
  });

  it('one address field on the supplier form, and a line saying what a supplier is', () => {
    const sup = src('app/kolaystok/app/suppliers/page.tsx');
    expect(sup).toContain("t('ks.sup.intro')");
    expect(src('lib/i18n/tr.ts')).toContain("'ks.sup.emails': 'Sipariş mailleri bu adrese gider");
    expect(src('lib/i18n/tr.ts')).toContain("'ks.sup.intro': 'Tedarikçi: mal aldığınız firma.");
  });
});

describe('quote customer box', () => {
  const page = src('app/kolaystok/app/quotes/new/page.tsx');
  it('typing opens a list of matches; the choice shows in a card below with "Değiştir"', () => {
    expect(page).toContain('role="combobox"');
    expect(page).toContain('role="listbox"');
    expect(page).toContain("t('ks.quote.chosen')");
    expect(page).toContain("t('ks.quote.change')");
  });

  it('an unknown email address can become a new customer with one tap; a customer without email gets one in the card', () => {
    expect(page).toContain("fill('ks.quote.createFromEmail', { email: typed })");
    expect(page).toContain('body: JSON.stringify({ name: typed, email: typed })');
    expect(page).toContain("method: 'PATCH'");
    expect(page).toContain("t('ks.quote.addCustomerEmail')");
  });
});

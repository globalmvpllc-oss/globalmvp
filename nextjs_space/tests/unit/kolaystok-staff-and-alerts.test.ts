import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Server-side checks for the last pre-launch fixes:
 *  - only the account owner adds people, makes managers, changes PINs, removes people;
 *  - any manager can sign a person out everywhere; a new PIN signs them out too;
 *  - "new staff link" makes the old link stop working;
 *  - at most 20 instant low-stock alerts per company per day (mail + Telegram).
 */
const h = vi.hoisted(() => {
  const state = {
    actor: null as any,
    staff: [] as any[],
    settings: [] as any[],
    alertDays: new Map<string, number>(),
    mails: [] as string[],
    telegrams: [] as string[],
  };
  const prisma: any = {
    stockStaff: {
      count: async ({ where }: any) => state.staff.filter((s) => s.companyId === where.companyId && s.isActive).length,
      create: async ({ data }: any) => {
        const s = { id: `s${state.staff.length + 1}`, isActive: true, sessionVersion: 0, failedPins: 0, lockedUntil: null, ...data };
        state.staff.push(s);
        return { id: s.id, name: s.name, role: s.role };
      },
      findFirst: async ({ where }: any) => state.staff.find((s) => s.id === where.id && s.companyId === where.companyId && s.isActive) ?? null,
      update: async ({ where, data }: any) => {
        const s = state.staff.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries<any>(data)) s[k] = v && typeof v === 'object' && 'increment' in v ? s[k] + v.increment : v;
        return s;
      },
      updateMany: async ({ where, data }: any) => {
        const s = state.staff.find((x) => x.id === where.id && x.companyId === where.companyId && x.isActive);
        if (!s) return { count: 0 };
        for (const [k, v] of Object.entries<any>(data)) s[k] = v && typeof v === 'object' && 'increment' in v ? s[k] + v.increment : v;
        return { count: 1 };
      },
    },
    stockSettings: {
      findUnique: async ({ where }: any) =>
        state.settings.find((s) => (where.companyId ? s.companyId === where.companyId : s.staffCode === where.staffCode)) ?? null,
      create: async ({ data }: any) => { state.settings.push({ id: 'set1', ...data }); return data; },
      update: async ({ where, data }: any) => {
        const s = state.settings.find((x) => x.companyId === where.companyId);
        Object.assign(s, data);
        return s;
      },
    },
    company: { findUnique: async () => ({ name: 'TEST- Firma', country: 'TR' }) },
    companyMember: { findMany: async () => [] },
    stockTelegramChat: { findMany: async () => [{ chatId: 'chat1' }] },
    // The alert-limit counter: INSERT … ON CONFLICT … WHERE sent < limit RETURNING sent.
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');
      if (!sql.includes('"StockAlertDay"')) throw new Error('unexpected SQL');
      const [companyId, day, limit] = values;
      const key = `${companyId}:${day}`;
      const sent = state.alertDays.get(key) ?? 0;
      if (sent >= limit) return [];
      state.alertDays.set(key, sent + 1);
      return [{ sent: sent + 1 }];
    },
  };
  return { state, prisma };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/stock/actor', () => ({ requireStockActor: async () => ({ actor: h.state.actor, error: null }) }));
vi.mock('@/lib/email/mailer', () => ({ sendMail: async ({ to }: any) => { h.state.mails.push(to); return { ok: true }; } }));
vi.mock('@/lib/stock/telegram', () => ({
  sendTelegram: async (chatId: string) => { h.state.telegrams.push(chatId); return true; },
  telegramConfigured: () => true,
  telegramBotUsername: () => 'AvcKolayStok_bot',
}));

import { POST as addStaff } from '@/app/api/stock/staff/route';
import { PUT as editStaff, DELETE as removeStaff } from '@/app/api/stock/staff/[id]/route';
import { POST as renewLink } from '@/app/api/stock/staff/link/route';
import { GET as publicStaff } from '@/app/api/stock/public/staff/route';
import { notifyLowStock } from '@/lib/stock/alerts';
import { DAILY_ALERT_LIMIT, stockDayKey } from '@/lib/stock/rules';

const OWNER = { kind: 'user', role: 'manager', companyId: 'c1', name: 'Sahip', userId: 'u1', staffId: null, email: 'o@x.test' };
const PIN_MANAGER = { kind: 'staff', role: 'manager', companyId: 'c1', name: 'Ayşe', userId: null, staffId: 's1', email: null };

const json = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: { id } });

beforeEach(() => {
  h.state.staff = [{ id: 's1', companyId: 'c1', name: 'Ayşe', role: 'manager', isActive: true, sessionVersion: 0, failedPins: 0, lockedUntil: null, pinHash: 'x' }];
  h.state.settings = [{ id: 'set1', companyId: 'c1', staffCode: 'oldlink123', alertEmails: ['alert@x.test'] }];
  h.state.alertDays.clear();
  h.state.mails = [];
  h.state.telegrams = [];
});

describe('only the account owner manages people', () => {
  it('a PIN manager cannot add a person, make a manager, change a PIN or remove someone', async () => {
    h.state.actor = PIN_MANAGER;
    const add = await addStaff(json({ name: 'Yeni', pin: '1234', role: 'manager' }));
    expect(add.status).toBe(403);
    expect((await add.json()).code).toBe('OWNER_ONLY');
    expect(h.state.staff).toHaveLength(1);

    expect((await editStaff(json({ role: 'staff' }), params('s1'))).status).toBe(403);
    expect((await editStaff(json({ pin: '9999' }), params('s1'))).status).toBe(403);
    expect((await removeStaff(json({}), params('s1'))).status).toBe(403);
    expect(h.state.staff[0]).toMatchObject({ role: 'manager', isActive: true, pinHash: 'x', sessionVersion: 0 });
  });

  it('the account owner can do all of it', async () => {
    h.state.actor = OWNER;
    expect((await addStaff(json({ name: 'Ali', pin: '1234', role: 'staff' }))).status).toBe(201);
    expect((await editStaff(json({ role: 'staff' }), params('s1'))).status).toBe(200);
    expect((await removeStaff(json({}), params('s2'))).status).toBe(200);
    expect(h.state.staff.find((s) => s.id === 's2')?.isActive).toBe(false);
  });
});

describe('ending sessions', () => {
  it('any manager can sign a person out everywhere (their cookies stop working)', async () => {
    h.state.actor = PIN_MANAGER;
    const res = await editStaff(json({ signOut: true }), params('s1'));
    expect(res.status).toBe(200);
    expect(h.state.staff[0].sessionVersion).toBe(1);
  });

  it('a new PIN signs the person out by itself', async () => {
    h.state.actor = OWNER;
    await editStaff(json({ pin: '4321' }), params('s1'));
    expect(h.state.staff[0].sessionVersion).toBe(1);
    expect(h.state.staff[0].pinHash).not.toBe('x');
  });
});

describe('new staff link', () => {
  it('after renewing, the old link finds nothing and the new one works', async () => {
    h.state.actor = PIN_MANAGER;
    const res = await renewLink();
    expect(res.status).toBe(200);
    const { staffCode } = await res.json();
    expect(staffCode).not.toBe('oldlink123');
    const old = await publicStaff(new Request('http://x/api/stock/public/staff?code=oldlink123'));
    expect(old.status).toBe(404);
    expect(h.state.settings[0].staffCode).toBe(staffCode);
  });
});

describe('instant alert limit', () => {
  const product = { code: 'P1', name: 'Çember', unit: 'adet', quantity: 1, minStock: 5 };

  it('sends at most 20 alerts a day per company; the rest wait for the 07:00 summary', async () => {
    for (let i = 0; i < DAILY_ALERT_LIMIT + 5; i++) await notifyLowStock('c1', product);
    expect(h.state.mails).toHaveLength(DAILY_ALERT_LIMIT);
    expect(h.state.telegrams).toHaveLength(DAILY_ALERT_LIMIT);
    // Another company has its own 20.
    await notifyLowStock('c2', product);
    expect(h.state.telegrams).toHaveLength(DAILY_ALERT_LIMIT + 1);
  });

  it('the day is the Turkey day', () => {
    expect(stockDayKey(new Date('2026-11-04T20:59:00Z'))).toBe('2026-11-04');
    expect(stockDayKey(new Date('2026-11-04T21:00:00Z'))).toBe('2026-11-05');
  });
});

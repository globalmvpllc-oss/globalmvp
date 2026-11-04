import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import Decimal from 'decimal.js';

// --- in-memory database for reset / undo and the Telegram webhook ---------
const db = vi.hoisted(() => {
  const state = {
    products: [] as any[],
    movements: [] as any[],
    resets: [] as any[],
    codes: [] as any[],
    chats: [] as any[],
    sent: [] as Array<{ chatId: string; text: string }>,
  };
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const tx: any = {
    stockProduct: {
      findFirst: async ({ where }: any) =>
        state.products.find((p) => p.id === where.id && p.companyId === where.companyId && (where.isActive === undefined || p.isActive === where.isActive)) ?? null,
      findMany: async ({ where }: any) =>
        state.products.filter((p) => p.companyId === where.companyId && p.isActive && (!where.NOT || !new Decimal(p.quantity).isZero())),
      update: async ({ where, data }: any) => {
        const p = state.products.find((x) => x.id === where.id);
        p.quantity = new Decimal(p.quantity).plus(data.quantity.increment).toString();
        return { ...p };
      },
      updateMany: async ({ where, data }: any) => {
        const p = state.products.find((x) => x.id === where.id);
        if (where.lowAlertAt === null && p.lowAlertAt === null) { p.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
        if (where.lowAlertAt?.not === null && p.lowAlertAt !== null) { p.lowAlertAt = data.lowAlertAt; return { count: 1 }; }
        return { count: 0 };
      },
    },
    stockMovement: {
      create: async ({ data }: any) => { const m = { id: id('m'), ...data }; state.movements.push(m); return { id: m.id }; },
      findMany: async ({ where }: any) => state.movements.filter((m) => m.companyId === where.companyId && m.resetId === where.resetId && m.reason === where.reason),
    },
    stockReset: {
      create: async ({ data }: any) => { const r = { id: id('r'), createdAt: new Date(), undoneAt: null, ...data }; state.resets.push(r); return { id: r.id }; },
      findFirst: async ({ where }: any) =>
        [...state.resets].reverse().find((r) => r.companyId === where.companyId && r.undoneAt === null) ?? null,
      updateMany: async ({ where, data }: any) => {
        const r = state.resets.find((x) => x.id === where.id && x.undoneAt === null);
        if (!r) return { count: 0 };
        r.undoneAt = data.undoneAt;
        return { count: 1 };
      },
    },
    stockTelegramCode: {
      findUnique: async ({ where }: any) => state.codes.find((c) => c.codeHash === where.codeHash) ?? null,
      updateMany: async ({ where, data }: any) => {
        const c = state.codes.find((x) => x.id === where.id && x.usedAt === null && x.expiresAt > where.expiresAt.gt);
        if (!c) return { count: 0 };
        c.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    stockTelegramChat: {
      upsert: async ({ create }: any) => {
        const existing = state.chats.find((c) => c.companyId === create.companyId && c.chatId === create.chatId);
        if (!existing) state.chats.push({ id: id('t'), ...create });
        return {};
      },
      findUnique: async ({ where }: any) =>
        state.chats.find((c) => c.companyId === where.companyId_chatId.companyId && c.chatId === where.companyId_chatId.chatId) ?? null,
      deleteMany: async ({ where }: any) => {
        const before = state.chats.length;
        state.chats = state.chats.filter((c) => c.chatId !== where.chatId);
        return { count: before - state.chats.length };
      },
    },
  };
  return { state, tx };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: { ...db.tx, $transaction: async (fn: any) => fn(db.tx) } }));
vi.mock('@/lib/s3', () => ({ putObject: async () => {}, deleteFile: async () => {}, getFileUrl: async () => 'https://s3/x' }));
vi.mock('@/lib/stock/telegram', () => ({
  sendTelegram: async (chatId: string, text: string) => { db.state.sent.push({ chatId, text }); return true; },
  telegramConfigured: () => true,
  telegramBotUsername: () => 'AvcKolayStok_bot',
}));

import {
  countCorrections,
  groupOrderLines,
  isResetWord,
  MANUAL_REASONS,
} from '@/lib/stock/rules';
import { checkImportRows } from '@/lib/stock/excel';
import { hashTelegramCode, isTelegramSecretValid, newTelegramCode, parseTelegramCommand, telegramLink } from '@/lib/stock/telegram-rules';
import { resetAllStock, undoLastReset, RESET_UNDO_HOURS } from '@/lib/stock/data';
import { DEFAULT_QUICK_REASONS } from '@/lib/stock/settings';
import { POST as telegramWebhook } from '@/app/api/webhooks/telegram/route';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');
const actor = { kind: 'user', role: 'manager', companyId: 'c1', name: 'Mehmet', userId: 'u1', staffId: null, email: 'm@x.test' } as const;

beforeEach(() => {
  db.state.products = [
    { id: 'p1', companyId: 'c1', code: 'A', name: 'Ürün A', unit: 'adet', quantity: '100', minStock: '50', lowAlertAt: null, isActive: true },
    { id: 'p2', companyId: 'c1', code: 'B', name: 'Ürün B', unit: 'adet', quantity: '7.5', minStock: '50', lowAlertAt: new Date(), isActive: true },
    { id: 'p3', companyId: 'c1', code: 'C', name: 'Ürün C', unit: 'adet', quantity: '0', minStock: '50', lowAlertAt: new Date(), isActive: true },
    { id: 'p9', companyId: 'other', code: 'Z', name: 'Başka', unit: 'adet', quantity: '40', minStock: '5', lowAlertAt: null, isActive: true },
  ];
  db.state.movements = [];
  db.state.resets = [];
  db.state.codes = [];
  db.state.chats = [];
  db.state.sent = [];
});

describe('count (sayım)', () => {
  it('writes counted − current for counted products that differ, nothing else', () => {
    const current = new Map<string, Decimal.Value>([['p1', 100], ['p2', 7.5], ['p3', 0]]);
    const out = countCorrections([{ productId: 'p1', counted: 97 }, { productId: 'p2', counted: 7.5 }, { productId: 'p3', counted: 4 }, { productId: 'gone', counted: 1 }], current);
    expect(out.map((c) => [c.productId, c.delta.toNumber()])).toEqual([['p1', -3], ['p3', 4]]);
  });
  it('finishing is claimed once and records "count" movements', () => {
    const route = src('app/api/stock/counts/[id]/finish/route.ts');
    expect(route).toContain("where: { id: params.id, companyId: actor.companyId, status: 'open' }");
    expect(route).toContain("reason: 'count'");
  });
});

describe('purchase-order draft', () => {
  it('groups by the product’s supplier, else its category’s; quantity = target − current or min × 2 − current', () => {
    const groups = groupOrderLines([
      { id: 'a', code: 'A', name: 'A', unit: 'adet', quantity: 10, minStock: 50, targetStock: 200, vendorId: 'v1' },
      { id: 'b', code: 'B', name: 'B', unit: 'adet', quantity: 20, minStock: 50, vendorId: null, categoryVendorId: 'v1' },
      { id: 'c', code: 'C', name: 'C', unit: 'kg', quantity: 0, minStock: 5, vendorId: null, categoryVendorId: null },
      { id: 'd', code: 'D', name: 'D', unit: 'adet', quantity: 300, minStock: 50, targetStock: 100, vendorId: 'v2' },
    ]);
    expect(groups).toEqual([
      { vendorId: 'v1', lines: [{ productId: 'a', code: 'A', name: 'A', unit: 'adet', quantity: 190 }, { productId: 'b', code: 'B', name: 'B', unit: 'adet', quantity: 80 }] },
      { vendorId: null, lines: [{ productId: 'c', code: 'C', name: 'C', unit: 'kg', quantity: 10 }] },
    ]);
  });
  it('never sends by itself: send needs the manager’s explicit confirmation and permission', () => {
    const send = src('app/api/stock/orders/send/route.ts');
    expect(send).toContain("requireStockActor('order.email')");
    expect(send).toContain('body?.confirmed !== true');
    expect(src('app/api/stock/orders/preview/route.ts')).not.toContain('sendMail');
    for (const file of ['lib/cron/stock-jobs.ts', 'lib/stock/alerts.ts', 'app/api/stock/movements/route.ts']) {
      expect(src(file), file).not.toContain('orders');
    }
  });
  it('sends from stok@corpcontrol.net until the customer’s own address is verified; replies go to the owner', () => {
    const orders = src('lib/stock/orders.ts');
    expect(orders).toContain("DEFAULT_STOCK_SENDER = 'stok@corpcontrol.net'");
    expect(orders).toContain('settings?.senderEmail && settings.senderVerifiedAt ? settings.senderEmail : DEFAULT_STOCK_SENDER');
  });
});

describe('reset all stock and undo', () => {
  it('needs the account password and the word SIFIRLA; backup before the reset', () => {
    expect(isResetWord('SIFIRLA')).toBe(true);
    expect(isResetWord(' sıfırla ')).toBe(true);
    expect(isResetWord('RESET')).toBe(false);
    const route = src('app/api/stock/reset/route.ts');
    expect(route).toContain("actor.kind !== 'user'");
    expect(route).toContain('bcrypt.compare(body.password, user.hashedPassword)');
    expect(route.indexOf('putObject(backupKey')).toBeLessThan(route.indexOf('resetAllStock(actor'));
    expect(route).toContain('attachments: [{');
  });
  it('sets every product of this company to 0, as "reset" movements, and nothing of another company', async () => {
    const r = await resetAllStock(actor as any, 'k');
    expect(r.changed).toBe(2); // p3 is already 0
    expect(db.state.products.find((p) => p.id === 'p1').quantity).toBe('0');
    expect(db.state.products.find((p) => p.id === 'p2').quantity).toBe('0');
    expect(db.state.products.find((p) => p.id === 'p9').quantity).toBe('40');
    expect(db.state.movements.every((m) => m.reason === 'reset' && m.resetId === r.resetId)).toBe(true);
  });
  it('undo within 24 hours puts every quantity back, once', async () => {
    await resetAllStock(actor as any, 'k');
    const undone = await undoLastReset(actor as any);
    expect(undone).toEqual({ ok: true, restored: 2 });
    expect(db.state.products.find((p) => p.id === 'p1').quantity).toBe('100');
    expect(db.state.products.find((p) => p.id === 'p2').quantity).toBe('7.5');
    expect(await undoLastReset(actor as any)).toEqual({ ok: false, code: 'NONE' });
  });
  it('not after 24 hours', async () => {
    await resetAllStock(actor as any, 'k');
    const later = new Date(Date.now() + (RESET_UNDO_HOURS + 1) * 3_600_000);
    expect(await undoLastReset(actor as any, later)).toEqual({ ok: false, code: 'TOO_LATE' });
  });
  it('a reset does not send alerts', () => {
    expect(src('lib/stock/data.ts')).not.toContain('notifyLowStock');
  });
});

describe('Excel bulk upload checks', () => {
  it('new codes need a name; bad numbers, duplicates and the plan limit are errors; filled columns only update', () => {
    const result = checkImportRows(
      [
        { row: 2, code: 'N1', name: 'Yeni', stock: '10', salePrice: '1.250,50' },
        { row: 3, code: 'E1', salePrice: '99', stock: '5' },
        { row: 4, code: 'N2' },
        { row: 5, code: 'N1', name: 'Tekrar' },
        { row: 6, code: 'E2', minStock: 'abc' },
        { row: 7, code: 'N3', name: 'Üçüncü' },
      ],
      new Set(['E1', 'E2']),
      1
    );
    const byRow = new Map(result.rows.map((r) => [r.row, r]));
    expect(byRow.get(2)).toMatchObject({ action: 'create', errors: [], values: { name: 'Yeni', stock: 10, salePrice: 1250.5 } });
    expect(byRow.get(3)).toMatchObject({ action: 'update', errors: [], values: { salePrice: 99, stock: 5 } });
    expect(byRow.get(3)!.values).not.toHaveProperty('name');
    expect(byRow.get(4)!.errors).toContain('name:missing');
    expect(byRow.get(5)!.errors).toContain('code:duplicate');
    expect(byRow.get(6)!.errors).toContain('minStock:invalid');
    expect(byRow.get(7)!.errors).toContain('plan:limit');
    expect(result).toMatchObject({ creates: 1, updates: 1, errorCount: 4 });
  });
  it('apply re-reads the file on the server and refuses when a row has errors', () => {
    const route = src('app/api/stock/import/route.ts');
    expect(route).toContain('checked = await checkImportFile(actor.companyId, file)');
    expect(route).toContain("if (checked.errorCount > 0) return NextResponse.json({ ...checked, error: 'Fix the rows with errors first.', code: 'HAS_ERRORS' }, { status: 409 })");
    expect(src('lib/stock/import.ts')).toContain("reason: 'count', note: 'Excel'");
  });
});

describe('Telegram: one bot, per-person expiring links', () => {
  it('commands and links', () => {
    expect(parseTelegramCommand('/start abc_DEF-123')).toEqual({ cmd: 'start', arg: 'abc_DEF-123' });
    expect(parseTelegramCommand('/start@AvcKolayStok_bot abc')).toEqual({ cmd: 'start', arg: 'abc' });
    expect(parseTelegramCommand('/stop')).toEqual({ cmd: 'stop' });
    expect(parseTelegramCommand('/start')).toBeNull();
    expect(parseTelegramCommand('merhaba')).toBeNull();
    const { code, codeHash } = newTelegramCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    expect(codeHash).toBe(hashTelegramCode(code));
    expect(telegramLink('AvcKolayStok_bot', code)).toBe(`https://t.me/AvcKolayStok_bot?start=${code}`);
  });
  it('the webhook secret is required and compared exactly', () => {
    expect(isTelegramSecretValid('s3cret', 's3cret')).toBe(true);
    expect(isTelegramSecretValid('s3cret', 's3creT')).toBe(false);
    expect(isTelegramSecretValid(null, 's3cret')).toBe(false);
    expect(isTelegramSecretValid('x', undefined)).toBe(false);
  });

  const call = (body: unknown, secret: string | null = 'wh-secret') =>
    telegramWebhook(new Request('https://x.test/api/webhooks/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
      body: JSON.stringify(body),
    }));
  const message = (text: string, chatId = 555) => ({ update_id: 1, message: { chat: { id: chatId }, from: { first_name: 'Ali' }, text } });

  it('refuses a request without the secret', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'wh-secret';
    expect((await call(message('/stop'), null)).status).toBe(401);
    expect((await call(message('/stop'), 'wrong')).status).toBe(401);
  });

  it('/start with a valid code connects this chat to that company, once; /stop disconnects', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'wh-secret';
    const { code, codeHash } = newTelegramCode();
    db.state.codes.push({ id: 'k1', companyId: 'c1', codeHash, label: 'Mehmet', expiresAt: new Date(Date.now() + 60_000), usedAt: null, company: { name: 'TEST- KolayStok', country: 'TR' } });
    expect((await call(message(`/start ${code}`))).status).toBe(200);
    expect(db.state.chats).toEqual([expect.objectContaining({ companyId: 'c1', chatId: '555', name: 'Ali' })]);
    // The same link a second time (a retry, or another person) connects nobody new.
    await call(message(`/start ${code}`, 777));
    expect(db.state.chats).toHaveLength(1);
    await call(message('/stop'));
    expect(db.state.chats).toHaveLength(0);
    expect(db.state.sent.at(-1)?.text).toContain('kesildi');
  });

  it('an expired code connects nothing', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'wh-secret';
    const { code, codeHash } = newTelegramCode();
    db.state.codes.push({ id: 'k2', companyId: 'c1', codeHash, label: 'x', expiresAt: new Date(Date.now() - 1000), usedAt: null, company: { name: 'X', country: 'TR' } });
    await call(message(`/start ${code}`));
    expect(db.state.chats).toHaveLength(0);
  });
});

describe('one-tap reasons, usage mode, PWA', () => {
  it('+ is "Mal kabul" and − is "Satış" by default, changeable in Settings', () => {
    expect(DEFAULT_QUICK_REASONS).toEqual({ plus: 'receipt', minus: 'sale' });
    expect(MANUAL_REASONS).toContain('receipt');
    const home = src('app/kolaystok/app/page.tsx');
    expect(home).toContain('move(p, 1, ks.quickReasons.plus)');
    expect(home).toContain('move(p, -1, ks.quickReasons.minus)');
    expect(src('app/api/stock/settings/route.ts')).toContain("code: 'MIGRATION_PENDING'");
  });
  it('removing a product only deactivates it; no real delete anywhere in KolayStok', () => {
    const product = src('app/api/stock/products/[id]/route.ts');
    expect(product).toContain('data: { isActive: false }');
    for (const file of ['app/api/stock/products/[id]/route.ts', 'app/api/stock/products/route.ts', 'lib/stock/import.ts']) {
      expect(src(file), file).not.toMatch(/stockProduct\.(delete|deleteMany)\(/);
    }
    expect(src('lib/stock/service.ts')).toContain("...(systemReason ? {} : { isActive: true })");
  });
  it('"Sadece stok" sends the company to KolayStok', () => {
    expect(src('app/(app)/layout.tsx')).toContain("if (mode?.usageMode === 'stock') redirect('/kolaystok/app');");
    expect(src('app/onboarding/page.tsx')).toContain("form.usageMode === 'stock' ? '/kolaystok/app' : destination");
  });
  it('installable as "Avc KolayStok"', () => {
    const manifest = JSON.parse(src('public/kolaystok.webmanifest'));
    expect(manifest).toMatchObject({ name: 'Avc KolayStok', start_url: '/kolaystok/app', display: 'standalone' });
    expect(manifest.icons.map((i: any) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(src('middleware.ts')).toContain("pathname === '/kolaystok-sw.js'");
  });
  it('the nightly job backs up and summarizes stock', () => {
    expect(src('app/api/cron/daily/route.ts')).toContain('runStockNightly(now)');
    expect(src('lib/stock/data.ts')).toContain('BACKUP_DAYS = 30');
  });
});

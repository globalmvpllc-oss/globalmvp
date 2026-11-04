/**
 * Creates (or recreates) the "TEST- KolayStok" test company for end-to-end
 * checks: 10 products, a PIN manager and a PIN staff member, a supplier.
 *
 *   npx tsx --require dotenv/config scripts/kolaystok-test-seed.ts            create
 *   npx tsx --require dotenv/config scripts/kolaystok-test-seed.ts --delete   remove it again
 *
 * Everything is prefixed TEST-. Alert and order emails go to Resend's test
 * inbox (delivered@resend.dev), never to a person. Generated credentials are
 * written to ../musteri-veri/test/test-kolaystok.json (git-ignored), never
 * printed.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { buildSearchKey } from '../lib/stock/rules';

const prisma = new PrismaClient();
const OWNER_EMAIL = 'test-kolaystok@corpcontrol.test';
const COMPANY = 'TEST- KolayStok';
const TEST_INBOX = 'delivered@resend.dev';
const OUT = path.resolve(__dirname, '../../musteri-veri/test/test-kolaystok.json');

const PRODUCTS: Array<[string, string, string, string, number, number]> = [
  ['TPZ001', 'TEST- Alüminyum Pizza Çevirme 20 cm', 'TEST- Pizza ekipmanları', '20 cm', 120, 1320],
  ['TPZ002', 'TEST- Alüminyum Pizza Çevirme 25 cm', 'TEST- Pizza ekipmanları', '25 cm', 51, 1440],
  ['TPZ003', 'TEST- Pizza Kesici Çelik', 'TEST- Pizza ekipmanları', '10 cm', 30, 380],
  ['TAR040', 'TEST- Argon Pasta Çemberi Ø40', 'TEST- Pasta çemberleri', 'Ø40', 0, 640],
  ['TAR050', 'TEST- Argon Pasta Çemberi Ø50', 'TEST- Pasta çemberleri', 'Ø50', 75, 720],
  ['TAR060', 'TEST- Argon Pasta Çemberi Ø60', 'TEST- Pasta çemberleri', 'Ø60', 200, 810],
  ['TDT010', 'TEST- Delikli Tart Çemberi 10 cm', 'TEST- Pasta çemberleri', '10 cm', 52, 210],
  ['TSK001', 'TEST- Silikon Dondurma Kalıbı', 'TEST- Silikon kalıplar', 'Standart', 10, 450],
  ['TSK002', 'TEST- Silikon Pasta Kalıbı Şerit', 'TEST- Silikon kalıplar', 'Şerit', 140, 520],
  ['TCK001', 'TEST- Çikolata Spatulası İnce', 'TEST- Silikon kalıplar', 'İnce', 0, 150],
];

async function remove() {
  const company = await prisma.company.findFirst({ where: { name: COMPANY } });
  if (company) await prisma.company.delete({ where: { id: company.id } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
  const left = await prisma.company.count({ where: { name: COMPANY } });
  const users = await prisma.user.count({ where: { email: OWNER_EMAIL } });
  console.log(`Removed. Remaining test companies: ${left}, test users: ${users}`);
}

async function create() {
  await remove();
  const password = randomBytes(12).toString('base64url');
  const pins = { manager: String(randomInt(1000, 10000)), staff: String(randomInt(1000, 10000)) };
  const user = await prisma.user.create({
    data: { email: OWNER_EMAIL, name: 'TEST- Yönetici', hashedPassword: await bcrypt.hash(password, 12), emailVerified: new Date(), language: 'tr' },
  });
  const company = await prisma.company.create({
    data: {
      name: COMPANY, country: 'TR', defaultCurrency: 'TRY', usageMode: 'stock', timezone: 'Europe/Istanbul', locale: 'tr-TR',
      grantedPlan: 'business', grantedPlanReason: 'TEST',
      members: { create: { userId: user.id, role: 'owner' } },
    },
  });
  const staffCode = `test${randomBytes(4).toString('hex')}`;
  await prisma.stockSettings.create({ data: { companyId: company.id, staffCode, alertEmails: [TEST_INBOX] }, select: { id: true } });
  const vendor = await prisma.vendor.create({
    data: { companyId: company.id, name: 'TEST- Tedarikçi Metal', email: TEST_INBOX, orderEmails: [TEST_INBOX], phone: '+90 000 000 00 00' },
  });
  const categories = new Map<string, string>();
  for (const [, , cat] of PRODUCTS) {
    if (categories.has(cat)) continue;
    const c = await prisma.stockCategory.create({ data: { companyId: company.id, name: cat, vendorId: vendor.id } });
    categories.set(cat, c.id);
  }
  for (const [code, name, cat, size, qty, price] of PRODUCTS) {
    const p = await prisma.stockProduct.create({
      data: {
        companyId: company.id, code, name, size, categoryId: categories.get(cat), unit: 'adet', salePrice: price, minStock: 50,
        targetStock: 150, quantity: qty, lowAlertAt: qty <= 50 ? new Date() : null, searchKey: buildSearchKey({ code, name, size }),
      },
    });
    if (qty > 0) {
      await prisma.stockMovement.create({ data: { companyId: company.id, productId: p.id, delta: qty, quantityAfter: qty, reason: 'opening', actorUserId: user.id, actorName: 'TEST- Yönetici' } });
    }
  }
  await prisma.stockStaff.create({ data: { companyId: company.id, name: 'TEST- Ayşe (Yönetici)', role: 'manager', pinHash: await bcrypt.hash(pins.manager, 10) } });
  await prisma.stockStaff.create({ data: { companyId: company.id, name: 'TEST- Ali (Personel)', role: 'staff', pinHash: await bcrypt.hash(pins.staff, 10) } });

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ ownerEmail: OWNER_EMAIL, password, staffLink: `/kolaystok/${staffCode}`, pins, companyId: company.id }, null, 2));
  console.log(`Created "${COMPANY}" with ${PRODUCTS.length} products and 2 staff. Credentials in musteri-veri/test/test-kolaystok.json`);
}

(process.argv.includes('--delete') ? remove() : create())
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

/**
 * Karadağ Metal → Avc KolayStok.
 *
 *   Dry run (default — reads the Excel only, writes a summary):
 *     npx tsx scripts/kolaystok-import-karadag.ts ../musteri-veri/karadag/Karadag_Metal_Fabrika_Stok_Listesi_2026.xlsx
 *
 *   Live import (after a database backup, once the owner has said "uygula"):
 *     npx tsx --require dotenv/config scripts/kolaystok-import-karadag.ts <xlsx> --apply --company <id> --owner <email>
 *
 * The live import refuses unless the company belongs to that owner, is in
 * stock mode and has an active Business grant (1,127 products is over Pro's
 * 1,000). Work goes in groups of 50: the group's photos go to the public
 * Vercel Blob store (webp, unguessable address), then its products are
 * written in one transaction, each with its "Açılış" movement. Re-running
 * skips codes already there, so a stopped run can simply be started again.
 * The owner's address is added to the low-stock alert recipients.
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { planKaradagImport, OPENING_STOCK, MIN_STOCK, type ImportedProduct } from '../lib/stock/karadag-import';
import { buildSearchKey } from '../lib/stock/rules';
import { putPublicFile, stockPath, publicToken } from '../lib/storage';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Same alphabet as lib/stock/settings.ts (which is server-only). */
function newStaffCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (const b of randomBytes(10)) out += alphabet[b % alphabet.length];
  return out;
}

async function dryRun(file: string) {
  const plan = await planKaradagImport(file);
  const units = new Map<string, number>();
  let priced = 0;
  let shelves = 0;
  let photoBytes = 0;
  for (const p of plan.products) {
    units.set(p.unit, (units.get(p.unit) ?? 0) + 1);
    if (p.salePrice !== null) priced += 1;
    if (p.shelf) shelves += 1;
    if (p.photo) photoBytes += p.photo.buffer.length;
  }

  const summary = {
    file: path.basename(file),
    products: plan.products.length,
    categories: plan.categories,
    units: Object.fromEntries(units),
    withSalePrice: priced,
    withShelf: shelves,
    openingStockEach: OPENING_STOCK,
    minStockEach: MIN_STOCK,
    images: { inSheet: plan.totals.images, matchedToProducts: plan.totals.matchedImages, originalMegabytes: Math.round(photoBytes / 1e5) / 10 },
    problems: {
      duplicateCodes: plan.problems.duplicateCodes,
      missingName: plan.problems.missingName,
      missingCode: plan.problems.missingCode,
      badPrice: plan.problems.badPrice,
      imagesWithoutProduct: plan.problems.imagesWithoutProduct,
      productsWithoutImage: plan.problems.productsWithoutImage,
      rowsWithSeveralImages: plan.problems.rowsWithSeveralImages,
      notInStockList: plan.problems.noStockListRow,
    },
    samples: plan.products.slice(0, 3).map(({ photo, ...rest }) => ({ ...rest, hasPhoto: Boolean(photo) })),
  };
  const out = path.join(path.dirname(file), 'kuru-calistirma-ozet.json');
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, samples: undefined }, null, 2));
  console.log(`\nSummary written to ${out}`);
}

async function apply(file: string, companyId: string, ownerEmail: string) {
  const plan = await planKaradagImport(file);
  const p = plan.problems;
  if (p.duplicateCodes.length || p.missingName.length || p.missingCode.length || p.badPrice.length) {
    throw new Error('The workbook has errors (see the dry run). Nothing written.');
  }

  const prisma = new PrismaClient();
  try {
    // --- Checks: right company, right owner, stock mode, Business, nothing foreign.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, usageMode: true, grantedPlan: true, grantedPlanUntil: true },
    });
    if (!company) throw new Error('Company not found.');
    const owner = await prisma.companyMember.findFirst({
      where: { companyId, role: 'owner', user: { email: { equals: ownerEmail, mode: 'insensitive' } } },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!owner) throw new Error('That e-mail is not the owner of this company.');
    if (company.usageMode !== 'stock') throw new Error(`Company is in "${company.usageMode}" mode, not stock.`);
    const grantActive = company.grantedPlan === 'business' && (!company.grantedPlanUntil || company.grantedPlanUntil > new Date());
    if (!grantActive) throw new Error('No active Business grant on this company yet (give it from the admin panel first).');

    const codes = new Set(plan.products.map((x) => x.code));
    const existing = await prisma.stockProduct.findMany({ where: { companyId }, select: { code: true } });
    const foreign = existing.filter((e) => !codes.has(e.code));
    if (foreign.length) throw new Error(`Company already has ${foreign.length} products not in this file. Nothing written.`);
    const have = new Set(existing.map((e) => e.code));
    const todo = plan.products.filter((x) => !have.has(x.code));
    console.log(`${company.name}: ${todo.length} to add, ${have.size} already there.`);

    publicToken(); // fail before writing anything if the store is not configured
    let uploaded = 0;
    const uploadPhotos = async (items: ImportedProduct[]) => {
      const keys = new Map<string, string>();
      const queue = items.filter((x) => x.photo);
      const worker = async () => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          const webp = await sharp(item.photo!.buffer).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          keys.set(item.code, await putPublicFile(stockPath(companyId, 'urun', `${item.code}.webp`), webp, 'image/webp'));
          uploaded += 1;
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      return keys;
    };

    // --- Categories.
    const categoryIds = new Map<string, string>();
    for (const c of plan.categories) {
      const row = await prisma.stockCategory.upsert({
        where: { companyId_name: { companyId, name: c.name } },
        create: { companyId, name: c.name },
        update: {},
        select: { id: true },
      });
      categoryIds.set(c.name, row.id);
    }

    // --- Products + "Açılış" movement, 50 per transaction.
    const actorName = (owner.user.name || 'Excel yükleme').slice(0, 120);
    let created = 0;
    for (let i = 0; i < todo.length; i += 50) {
      const chunk: ImportedProduct[] = todo.slice(i, i + 50);
      const photoKeys = await uploadPhotos(chunk);
      await prisma.$transaction(
        async (tx) => {
          for (const item of chunk) {
            const product = await tx.stockProduct.create({
              data: {
                companyId,
                code: item.code,
                name: item.name,
                searchKey: buildSearchKey({ code: item.code, name: item.name, size: item.size, material: item.material }),
                categoryId: item.category ? categoryIds.get(item.category) ?? null : null,
                size: item.size,
                material: item.material,
                unit: item.unit,
                salePrice: item.salePrice,
                quantity: OPENING_STOCK,
                minStock: MIN_STOCK,
                shelf: item.shelf,
                photoKey: photoKeys.get(item.code) ?? null,
              },
              select: { id: true },
            });
            await tx.stockMovement.create({
              data: {
                companyId,
                productId: product.id,
                delta: OPENING_STOCK,
                quantityAfter: OPENING_STOCK,
                reason: 'opening',
                note: 'Excel yükleme',
                actorUserId: owner.user.id,
                actorName,
              },
            });
          }
        },
        { timeout: 120_000 }
      );
      created += chunk.length;
      console.log(`  products ${created}/${todo.length}, photos ${uploaded}`);
    }

    // --- Low-stock alert recipient: the owner's address.
    const settings = await prisma.stockSettings.findUnique({ where: { companyId }, select: { alertEmails: true } });
    const email = owner.user.email.toLowerCase();
    if (!settings) {
      await prisma.stockSettings.create({ data: { companyId, staffCode: newStaffCode(), alertEmails: [email] } });
    } else if (!settings.alertEmails.map((e) => e.toLowerCase()).includes(email)) {
      await prisma.stockSettings.update({ where: { companyId }, data: { alertEmails: [...settings.alertEmails, email] } });
    }

    console.log(JSON.stringify({ created, photos: uploaded, categories: categoryIds.size, alertRecipientSet: true }));
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Give the path to the Excel file.');
  if (!process.argv.includes('--apply')) return dryRun(file);
  const companyId = arg('--company');
  const owner = arg('--owner');
  if (!companyId || !owner) throw new Error('--apply needs --company <id> and --owner <email>.');
  return apply(file, companyId, owner);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

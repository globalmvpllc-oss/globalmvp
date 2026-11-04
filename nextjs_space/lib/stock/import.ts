import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { checkPlanLimit } from '@/lib/billing/limits';
import type { TxClient } from '@/lib/invoice-number';
import { buildSearchKey } from './rules';
import { checkImportRows, markUnknownSuppliers, readImportSheet, type CheckedRow } from './excel';
import { moveStockTx } from './service';
import type { StockActor } from './actor';

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

/** Reads an uploaded workbook and checks every row against this company. */
export async function checkImportFile(companyId: string, file: Buffer) {
  const raw = await readImportSheet(file);
  const [existing, vendors] = await Promise.all([
    prisma.stockProduct.findMany({ where: { companyId, isActive: true }, select: { code: true } }),
    prisma.vendor.findMany({ where: { companyId }, select: { name: true } }),
  ]);
  const verdict = await checkPlanLimit(companyId, 'stockProducts');
  const room = verdict.limit === null ? null : Math.max(verdict.limit - verdict.current, 0);
  const checked = checkImportRows(raw, new Set(existing.map((p) => p.code)), room);
  const warningCount = markUnknownSuppliers(checked.rows, vendors.map((v) => v.name));
  return { ...checked, warningCount };
}

/**
 * Applies checked rows (only when none has an error). New codes become
 * products (with an "Açılış" movement when Stok is filled); existing codes
 * get the filled columns updated, and a Stok value becomes a
 * "Sayım düzeltmesi" movement for the difference — never a silent overwrite.
 */
export async function applyImport(actor: StockActor, rows: CheckedRow[]): Promise<{ created: number; updated: number; moved: number }> {
  return prisma.$transaction(
    async (tx: TxClient) => {
      const categoryIds = new Map<string, string>();
      const vendors = await tx.vendor.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true } });
      const vendorByName = new Map(vendors.map((v) => [v.name.toLocaleLowerCase('tr-TR'), v.id]));
      const categoryId = async (name: string | null | undefined) => {
        if (!name) return null;
        if (categoryIds.has(name)) return categoryIds.get(name)!;
        const c = await tx.stockCategory.upsert({
          where: { companyId_name: { companyId: actor.companyId, name } },
          create: { companyId: actor.companyId, name },
          update: {},
          select: { id: true },
        });
        categoryIds.set(name, c.id);
        return c.id;
      };

      let created = 0;
      let updated = 0;
      let moved = 0;
      for (const row of rows) {
        const v = row.values;
        // An unknown supplier name (typo, cut-off text) leaves the product's
        // current supplier alone instead of wiping it.
        const vendorId = v.supplier ? vendorByName.get(v.supplier.toLocaleLowerCase('tr-TR')) : undefined;
        const existing = await tx.stockProduct.findFirst({
          where: { companyId: actor.companyId, code: row.code },
          select: { id: true, name: true, size: true, material: true, quantity: true, isActive: true },
        });
        if (!existing || !existing.isActive) {
          const name = v.name ?? existing?.name ?? row.code;
          const data = {
            name,
            searchKey: buildSearchKey({ code: row.code, name, size: v.size ?? null, material: v.material ?? null }),
            categoryId: await categoryId(v.category),
            size: v.size ?? null,
            material: v.material ?? null,
            unit: v.unit ?? 'adet',
            purchasePrice: v.purchasePrice ?? null,
            salePrice: v.salePrice ?? null,
            minStock: v.minStock ?? 50,
            targetStock: v.targetStock ?? null,
            shelf: v.shelf ?? null,
            vendorId: vendorId ?? null,
            notes: v.notes ?? null,
            isActive: true,
          };
          // A removed product with the same code comes back rather than clashing.
          const product = existing
            ? await tx.stockProduct.update({ where: { id: existing.id }, data, select: { id: true, quantity: true } })
            : await tx.stockProduct.create({ data: { companyId: actor.companyId, code: row.code, ...data }, select: { id: true, quantity: true } });
          created += 1;
          if (v.stock !== undefined) {
            const delta = new Decimal(v.stock).minus(product.quantity);
            if (!delta.isZero()) {
              await moveStockTx(tx, { companyId: actor.companyId, productId: product.id, delta, reason: existing ? 'count' : 'opening', note: 'Excel', actor });
              moved += 1;
            }
          }
          continue;
        }

        const name = v.name ?? existing.name;
        const size = v.size !== undefined ? v.size : existing.size;
        const material = v.material !== undefined ? v.material : existing.material;
        await tx.stockProduct.update({
          where: { id: existing.id },
          data: {
            ...(v.name !== undefined ? { name: v.name } : {}),
            ...(v.category !== undefined ? { categoryId: await categoryId(v.category) } : {}),
            ...(v.size !== undefined ? { size: v.size } : {}),
            ...(v.material !== undefined ? { material: v.material } : {}),
            ...(v.unit !== undefined ? { unit: v.unit } : {}),
            ...(v.purchasePrice !== undefined ? { purchasePrice: v.purchasePrice } : {}),
            ...(v.salePrice !== undefined ? { salePrice: v.salePrice } : {}),
            ...(v.minStock !== undefined ? { minStock: v.minStock } : {}),
            ...(v.targetStock !== undefined ? { targetStock: v.targetStock } : {}),
            ...(v.shelf !== undefined ? { shelf: v.shelf } : {}),
            ...(vendorId !== undefined ? { vendorId } : {}),
            ...(v.notes !== undefined ? { notes: v.notes } : {}),
            searchKey: buildSearchKey({ code: row.code, name, size, material }),
          },
        });
        updated += 1;
        if (v.stock !== undefined) {
          const delta = new Decimal(v.stock).minus(existing.quantity);
          if (!delta.isZero()) {
            await moveStockTx(tx, { companyId: actor.companyId, productId: existing.id, delta, reason: 'count', note: 'Excel', actor });
            moved += 1;
          }
        }
      }
      return { created, updated, moved };
    },
    { timeout: 180_000 }
  );
}

/** The uploaded file from a multipart request, size-checked. */
export async function uploadedFile(request: Request): Promise<Buffer | 'TOO_BIG' | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return null;
  if (file.size > IMPORT_MAX_BYTES) return 'TOO_BIG';
  return Buffer.from(await file.arrayBuffer());
}

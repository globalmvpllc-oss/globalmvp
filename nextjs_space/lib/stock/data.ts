import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { putObject, deleteFile } from '@/lib/s3';
import type { TxClient } from '@/lib/invoice-number';
import { stockWorkbook, type StockRow } from './excel';
import { stockLocale } from './alerts';
import { moveStockTx } from './service';
import type { StockActor } from './actor';

/** Active products as workbook rows; `critical` = at or below the minimum (incl. out). */
export async function loadStockRows(companyId: string, scope: 'all' | 'critical' = 'all'): Promise<StockRow[]> {
  let ids: string[] | null = null;
  if (scope === 'critical') {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "StockProduct" WHERE "companyId" = ${companyId} AND "isActive" = true AND quantity <= "minStock"`;
    ids = rows.map((r) => r.id);
  }
  const products = await prisma.stockProduct.findMany({
    where: { companyId, isActive: true, ...(ids ? { id: { in: ids } } : {}) },
    include: { category: { select: { name: true } }, vendor: { select: { name: true } } },
    orderBy: [{ name: 'asc' }, { code: 'asc' }],
  });
  return products.map((p) => ({
    code: p.code,
    name: p.name,
    categoryName: p.category?.name ?? null,
    size: p.size,
    material: p.material,
    unit: p.unit,
    quantity: p.quantity.toString(),
    minStock: p.minStock.toString(),
    targetStock: p.targetStock?.toString() ?? null,
    shelf: p.shelf,
    vendorName: p.vendor?.name ?? null,
    purchasePrice: p.purchasePrice?.toString() ?? null,
    salePrice: p.salePrice?.toString() ?? null,
  }));
}

export async function companyStockWorkbook(companyId: string, scope: 'all' | 'critical', withPrices: boolean) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true } });
  const locale = stockLocale(company?.country);
  const rows = await loadStockRows(companyId, scope);
  return { bytes: stockWorkbook(rows, locale, withPrices), rows, locale, companyName: company?.name ?? '' };
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const BACKUP_DAYS = 30;

/** The nightly backup: one workbook per company per day in S3; older than 30 days removed. */
export async function backupCompanyStock(companyId: string, now: Date): Promise<string> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const key = `kolaystok/${companyId}/yedek-${day.toISOString().slice(0, 10)}.xlsx`;
  const { bytes } = await companyStockWorkbook(companyId, 'all', true);
  await putObject(key, bytes, XLSX_TYPE);
  await prisma.stockBackup.upsert({
    where: { companyId_day: { companyId, day } },
    create: { companyId, day, s3Key: key },
    update: { s3Key: key },
  });
  const cutoff = new Date(day.getTime() - BACKUP_DAYS * 86_400_000);
  const old = await prisma.stockBackup.findMany({ where: { companyId, day: { lt: cutoff } }, select: { id: true, s3Key: true } });
  for (const b of old) {
    await deleteFile(b.s3Key).catch(() => {});
    await prisma.stockBackup.delete({ where: { id: b.id } }).catch(() => {});
  }
  return key;
}

export const RESET_UNDO_HOURS = 24;

/**
 * Reset all stock to zero: the caller has already checked the password and
 * the typed word, and taken the backup. Every product with a non-zero stock
 * gets a "Sıfırlama" movement tied to this reset, so it can be undone.
 * Alerts are not sent for a reset: emptying everything on purpose is not news.
 */
export async function resetAllStock(actor: StockActor, backupKey: string | null): Promise<{ resetId: string; changed: number }> {
  return prisma.$transaction(
    async (tx: TxClient) => {
      const reset = await tx.stockReset.create({
        data: { companyId: actor.companyId, byUserId: actor.userId ?? '', backupKey },
        select: { id: true },
      });
      const products = await tx.stockProduct.findMany({
        where: { companyId: actor.companyId, isActive: true, NOT: { quantity: 0 } },
        select: { id: true, quantity: true },
      });
      for (const p of products) {
        await moveStockTx(tx, {
          companyId: actor.companyId,
          productId: p.id,
          delta: new Decimal(p.quantity).negated(),
          reason: 'reset',
          actor,
          resetId: reset.id,
        });
      }
      return { resetId: reset.id, changed: products.length };
    },
    { timeout: 120_000 }
  );
}

/** Undo the last reset within 24 hours: each reset movement is reversed, once. */
export async function undoLastReset(actor: StockActor, now: Date = new Date()): Promise<{ ok: true; restored: number } | { ok: false; code: 'NONE' | 'TOO_LATE' }> {
  return prisma.$transaction(
    async (tx: TxClient) => {
      const last = await tx.stockReset.findFirst({
        where: { companyId: actor.companyId, undoneAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      });
      if (!last) return { ok: false as const, code: 'NONE' as const };
      if (now.getTime() - last.createdAt.getTime() > RESET_UNDO_HOURS * 3_600_000) return { ok: false as const, code: 'TOO_LATE' as const };
      const claimed = await tx.stockReset.updateMany({ where: { id: last.id, undoneAt: null }, data: { undoneAt: now } });
      if (claimed.count !== 1) return { ok: false as const, code: 'NONE' as const };
      const movements = await tx.stockMovement.findMany({
        where: { companyId: actor.companyId, resetId: last.id, reason: 'reset' },
        select: { productId: true, delta: true },
      });
      for (const m of movements) {
        await moveStockTx(tx, {
          companyId: actor.companyId,
          productId: m.productId,
          delta: new Decimal(m.delta).negated(),
          reason: 'reset-undo',
          actor,
          resetId: last.id,
        });
      }
      return { ok: true as const, restored: movements.length };
    },
    { timeout: 120_000 }
  );
}

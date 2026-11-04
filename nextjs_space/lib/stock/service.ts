import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import type { TxClient } from '@/lib/invoice-number';
import { can, stockLevel, UNDO_WINDOW_MS, type MovementReason } from './rules';
import type { StockActor } from './actor';

/**
 * Stock changes and what a screen may see.
 *
 * `quantity` on a product changes only here, together with its movement row,
 * inside one transaction, using an atomic increment — two people pressing "+"
 * at the same moment both count. The low-stock alert is claimed with a
 * conditional update, so it fires once per dip even under concurrency.
 */

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** A product as a screen sees it. Staff never receive prices or stock value. */
export function serializeProduct(p: any, actor: Pick<StockActor, 'role'>) {
  const prices = can(actor.role, 'read.prices');
  const quantity = Number(p.quantity);
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    categoryId: p.categoryId ?? null,
    categoryName: p.category?.name ?? null,
    size: p.size ?? null,
    material: p.material ?? null,
    unit: p.unit,
    quantity,
    minStock: Number(p.minStock),
    targetStock: num(p.targetStock),
    level: stockLevel(p.quantity, p.minStock),
    shelf: p.shelf ?? null,
    hasPhoto: Boolean(p.photoKey),
    vendorId: p.vendorId ?? null,
    vendorName: p.vendor?.name ?? null,
    notes: p.notes ?? null,
    updatedAt: p.updatedAt,
    ...(prices
      ? {
          purchasePrice: num(p.purchasePrice),
          salePrice: num(p.salePrice),
          stockValue: p.purchasePrice !== null && p.purchasePrice !== undefined ? new Decimal(p.purchasePrice).mul(p.quantity).toNumber() : null,
        }
      : {}),
  };
}

export interface MoveInput {
  companyId: string;
  productId: string;
  delta: Decimal.Value;
  reason: MovementReason;
  note?: string | null;
  actor: Pick<StockActor, 'name' | 'userId' | 'staffId'>;
  countId?: string | null;
  resetId?: string | null;
  undoOfId?: string | null;
}

export interface MoveResult {
  movementId: string;
  quantityAfter: number;
  /** True when this change crossed into the low zone and claimed the alert. */
  alert: boolean;
  product: { id: string; code: string; name: string; unit: string; quantity: number; minStock: number };
}

/** One stock change inside an existing transaction. Throws NOT_FOUND. */
export async function moveStockTx(tx: TxClient, input: MoveInput): Promise<MoveResult> {
  const delta = new Decimal(input.delta);
  // A removed (inactive) product takes no new stock changes; the system's own
  // reversals (undo, reset and its undo) still apply to it.
  const systemReason = input.reason === 'undo' || input.reason === 'reset' || input.reason === 'reset-undo';
  const exists = await tx.stockProduct.findFirst({
    where: { id: input.productId, companyId: input.companyId, ...(systemReason ? {} : { isActive: true }) },
    select: { id: true },
  });
  if (!exists) throw new Error('NOT_FOUND');

  const product = await tx.stockProduct.update({
    where: { id: input.productId },
    data: { quantity: { increment: delta.toString() } },
    select: { id: true, code: true, name: true, unit: true, quantity: true, minStock: true },
  });
  const after = new Decimal(product.quantity);
  const atOrBelow = after.lte(new Decimal(product.minStock));

  let alert = false;
  if (atOrBelow) {
    const claimed = await tx.stockProduct.updateMany({
      where: { id: product.id, lowAlertAt: null },
      data: { lowAlertAt: new Date() },
    });
    alert = claimed.count === 1;
  } else {
    await tx.stockProduct.updateMany({ where: { id: product.id, lowAlertAt: { not: null } }, data: { lowAlertAt: null } });
  }

  const movement = await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      productId: product.id,
      delta: delta.toString(),
      quantityAfter: after.toString(),
      reason: input.reason,
      note: input.note?.slice(0, 500) ?? null,
      actorUserId: input.actor.userId,
      actorStaffId: input.actor.staffId,
      actorName: input.actor.name.slice(0, 120),
      countId: input.countId ?? null,
      resetId: input.resetId ?? null,
      undoOfId: input.undoOfId ?? null,
    },
    select: { id: true },
  });

  return {
    movementId: movement.id,
    quantityAfter: after.toNumber(),
    alert,
    product: { id: product.id, code: product.code, name: product.name, unit: product.unit, quantity: after.toNumber(), minStock: Number(product.minStock) },
  };
}

export function moveStock(input: MoveInput): Promise<MoveResult> {
  return prisma.$transaction((tx: TxClient) => moveStockTx(tx, input));
}

/**
 * Undo a movement: a reverse movement, once, shortly after.
 * Staff may undo only their own; managers any.
 */
export async function undoMovement(
  actor: StockActor,
  movementId: string,
  now: Date = new Date()
): Promise<{ ok: true; result: MoveResult } | { ok: false; code: 'NOT_FOUND' | 'TOO_LATE' | 'ALREADY_UNDONE' | 'NOT_YOURS' | 'NOT_UNDOABLE' }> {
  return prisma.$transaction(async (tx: TxClient) => {
    const original = await tx.stockMovement.findFirst({
      where: { id: movementId, companyId: actor.companyId },
      select: { id: true, productId: true, delta: true, createdAt: true, undoneAt: true, undoOfId: true, actorStaffId: true, actorUserId: true, reason: true },
    });
    if (!original) return { ok: false as const, code: 'NOT_FOUND' as const };
    if (original.undoOfId || ['reset', 'reset-undo', 'opening'].includes(original.reason)) return { ok: false as const, code: 'NOT_UNDOABLE' as const };
    if (original.undoneAt) return { ok: false as const, code: 'ALREADY_UNDONE' as const };
    if (now.getTime() - original.createdAt.getTime() > UNDO_WINDOW_MS) return { ok: false as const, code: 'TOO_LATE' as const };
    const own =
      (actor.staffId && original.actorStaffId === actor.staffId) || (actor.userId && original.actorUserId === actor.userId);
    if (actor.role !== 'manager' && !own) return { ok: false as const, code: 'NOT_YOURS' as const };

    const stamped = await tx.stockMovement.updateMany({ where: { id: original.id, undoneAt: null }, data: { undoneAt: now } });
    if (stamped.count !== 1) return { ok: false as const, code: 'ALREADY_UNDONE' as const };
    const result = await moveStockTx(tx, {
      companyId: actor.companyId,
      productId: original.productId,
      delta: new Decimal(original.delta).negated(),
      reason: 'undo',
      actor,
      undoOfId: original.id,
    });
    return { ok: true as const, result };
  });
}

/** Start of "today" in Turkey (UTC+3, no DST) — the warehouse's day. */
export function startOfStockDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + 3 * 3600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 3 * 3600_000);
}

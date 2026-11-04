export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { requireStockActor } from '@/lib/stock/actor';
import { isManualReason } from '@/lib/stock/rules';
import { moveStock, startOfStockDay } from '@/lib/stock/service';
import { notifyLowStock } from '@/lib/stock/alerts';

/**
 * GET /api/stock/movements?productId=&staffId=&userId=&from=&to=&today=1&take=&skip=
 * — who, when, how much, why. Everyone who can read stock sees it.
 */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('read');
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });
    const take = Math.min(Math.max(Number(searchParams.get('take')) || 50, 1), 200);
    const skip = Math.max(Number(searchParams.get('skip')) || 0, 0);

    const where: Record<string, unknown> = { companyId: actor.companyId };
    const productId = searchParams.get('productId');
    const staffId = searchParams.get('staffId');
    const userId = searchParams.get('userId');
    if (productId) where.productId = productId;
    if (staffId) where.actorStaffId = staffId;
    if (userId) where.actorUserId = userId;
    if (searchParams.get('today') === '1') where.createdAt = { gte: startOfStockDay() };
    else if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { code: true, name: true, size: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return NextResponse.json({
      movements: rows.map((m) => ({
        id: m.id,
        productId: m.productId,
        productCode: m.product.code,
        productName: m.product.name,
        productSize: m.product.size ?? null,
        unit: m.product.unit,
        delta: Number(m.delta),
        quantityAfter: Number(m.quantityAfter),
        reason: m.reason,
        note: m.note,
        actorName: m.actorName,
        actorStaffId: m.actorStaffId,
        actorUserId: m.actorUserId,
        undone: Boolean(m.undoneAt),
        isUndo: Boolean(m.undoOfId),
        createdAt: m.createdAt,
      })),
      total,
    });
  } catch (error) {
    return handleApiError('stock:movements:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const schema = z.object({
  productId: z.string().min(1),
  delta: z.number().finite().refine((v) => v !== 0 && Math.abs(v) < 1e9, 'Invalid quantity'),
  reason: z.string().refine(isManualReason, 'Invalid reason'),
  note: z.string().trim().max(500).nullable().optional(),
});

/** POST { productId, delta, reason, note } — + / − and quantity changes (staff and up). */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('move');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the quantity and reason.', code: 'INVALID' }, { status: 400 });
    const result = await moveStock({
      companyId: actor.companyId,
      productId: parsed.data.productId,
      delta: parsed.data.delta,
      reason: parsed.data.reason as any,
      note: parsed.data.note ?? null,
      actor,
    });
    if (result.alert) await notifyLowStock(actor.companyId, result.product);
    return NextResponse.json({ movementId: result.movementId, quantity: result.quantityAfter }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return handleApiError('stock:movements:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

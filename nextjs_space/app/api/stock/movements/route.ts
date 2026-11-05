export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { requireStockActor } from '@/lib/stock/actor';
import { entryDirection, isManualReason } from '@/lib/stock/rules';
import { enterStock, EntryConfirmationNeeded, startOfStockDay } from '@/lib/stock/service';
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
  /** Always positive (a count may be 0). The reason decides add / take away / set. */
  quantity: z.number().finite().optional(),
  /** Older screens sent a signed change; accepted only when its sign matches the reason. */
  delta: z.number().finite().optional(),
  reason: z.string().refine(isManualReason, 'Invalid reason'),
  note: z.string().trim().max(500).nullable().optional(),
  confirmed: z.boolean().optional(),
});

/** The positive amount of an entry, from the new field or an older signed change. */
function entryQuantity(data: z.infer<typeof schema>): number | null {
  if (data.quantity !== undefined) return data.quantity;
  if (data.delta === undefined) return null;
  const direction = entryDirection(data.reason);
  if (direction === 'in' && data.delta > 0) return data.delta;
  if (direction === 'out' && data.delta < 0) return -data.delta;
  return null; // a sign against the reason, or a count sent as a change
}

/**
 * POST { productId, quantity, reason, note, confirmed } — a hand entry (staff and up).
 *
 * The amount is positive; Mal kabul / İade add, Satış / Fire / Üretim take
 * away, Sayım düzeltmesi sets the stock to the counted amount. More than 500
 * (or more than 3 × the stock) and anything that would take the stock below
 * zero answer 409 CONFIRM with the numbers, until sent again with confirmed.
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('move');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    const quantity = parsed.success ? entryQuantity(parsed.data) : null;
    if (!parsed.success || quantity === null) return NextResponse.json({ error: 'Check the quantity and reason.', code: 'INVALID' }, { status: 400 });
    const result = await enterStock({
      companyId: actor.companyId,
      productId: parsed.data.productId,
      quantity,
      reason: parsed.data.reason as any,
      note: parsed.data.note ?? null,
      actor,
      confirmed: parsed.data.confirmed === true,
    });
    if ('unchanged' in result) return NextResponse.json({ movementId: null, quantity: result.quantityAfter, unchanged: true });
    if (result.alert) await notifyLowStock(actor.companyId, result.product);
    return NextResponse.json({ movementId: result.movementId, quantity: result.quantityAfter }, { status: 201 });
  } catch (error) {
    if (error instanceof EntryConfirmationNeeded) return NextResponse.json({ error: 'Please confirm.', code: 'CONFIRM', ...error.details }, { status: 409 });
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof Error && (error.message === 'INVALID_QUANTITY' || error.message === 'INVALID_REASON')) {
      return NextResponse.json({ error: 'Check the quantity and reason.', code: 'INVALID' }, { status: 400 });
    }
    return handleApiError('stock:movements:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

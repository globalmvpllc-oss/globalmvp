export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { isValidPin, STAFF_ROLES } from '@/lib/stock/rules';

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  pin: z.string().refine(isValidPin, 'PIN must be 4 digits').optional(),
  role: z.enum(STAFF_ROLES).optional(),
  unlock: z.boolean().optional(),
});

/**
 * PUT — rename, new PIN, role, unlock (manager). A new PIN or role ends the
 * person's open sessions (sessionVersion is bumped).
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the form.', code: 'INVALID' }, { status: 400 });
    const existing = await prisma.stockStaff.findFirst({ where: { id: params.id, companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const d = parsed.data;
    const endsSessions = d.pin !== undefined || d.role !== undefined;
    await prisma.stockStaff.update({
      where: { id: existing.id },
      data: {
        ...(d.name ? { name: d.name } : {}),
        ...(d.role ? { role: d.role } : {}),
        ...(d.pin ? { pinHash: await bcrypt.hash(d.pin, 10) } : {}),
        ...(d.unlock || d.pin ? { failedPins: 0, lockedUntil: null } : {}),
        ...(endsSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:staff:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

/** DELETE — remove a person (manager). Their movements keep their name. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const result = await prisma.stockStaff.updateMany({
      where: { id: params.id, companyId: actor.companyId, isActive: true },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError('stock:staff:DELETE', error, { fallbackMessage: 'Could not delete.' });
  }
}

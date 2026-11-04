export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { isValidPin, isLocked, MAX_STAFF_PER_COMPANY, STAFF_ROLES } from '@/lib/stock/rules';
import { ensureStockSettings } from '@/lib/stock/settings';

/** GET — the staff list (manager). PINs are never returned. */
export async function GET() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const rows = await prisma.stockStaff.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, role: true, lockedUntil: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({
      staff: rows.map((s) => ({ id: s.id, name: s.name, role: s.role, locked: isLocked(s), createdAt: s.createdAt })),
      max: MAX_STAFF_PER_COMPANY,
    });
  } catch (error) {
    return handleApiError('stock:staff:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  pin: z.string().refine(isValidPin, 'PIN must be 4 digits'),
  role: z.enum(STAFF_ROLES).default('staff'),
});

/** POST { name, pin, role } — add a person (manager). At most five per company. */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a name and a 4-digit PIN.', code: 'INVALID' }, { status: 400 });
    const count = await prisma.stockStaff.count({ where: { companyId: actor.companyId, isActive: true } });
    if (count >= MAX_STAFF_PER_COMPANY) {
      return NextResponse.json({ error: 'At most five people.', code: 'STAFF_LIMIT', max: MAX_STAFF_PER_COMPANY }, { status: 409 });
    }
    await ensureStockSettings(actor.companyId);
    const staff = await prisma.stockStaff.create({
      data: {
        companyId: actor.companyId,
        name: parsed.data.name,
        role: parsed.data.role,
        pinHash: await bcrypt.hash(parsed.data.pin, 10),
      },
      select: { id: true, name: true, role: true },
    });
    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    return handleApiError('stock:staff:POST', error, { fallbackMessage: 'Could not save.' });
  }
}

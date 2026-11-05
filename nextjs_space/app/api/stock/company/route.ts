export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { isAcceptableLogoValue } from '@/lib/logo';

/**
 * "Şirket bilgileri" in KolayStok settings — the same Company record as the
 * CorpControl company settings, and what the quote PDF header is made of:
 * logo, name, address, phone, email, tax office and number.
 *
 * Read by managers; changed only by the account (owner or company admin),
 * never by a PIN staff session — the same rule as the usage mode.
 */
const SELECT = { name: true, logoUrl: true, address: true, city: true, postalCode: true, phone: true, email: true, taxOffice: true, taxNumber: true } as const;

/** Text field: trimmed; empty clears it. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  address: text(500),
  city: text(100),
  postalCode: text(20),
  phone: text(50),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email()
    .or(z.literal(''))
    .nullish()
    .transform((v) => (v ? v : null)),
  taxOffice: text(100),
  taxNumber: text(100),
  /** An image data URL (PNG, JPEG, WebP) made in the browser; null removes the logo; undefined leaves it. */
  logoUrl: z.string().max(700_000).nullable().optional(),
});

export async function GET() {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: SELECT });
    return NextResponse.json({ company, canEdit: actor.kind === 'user' });
  } catch (error) {
    return handleApiError('stock:company:GET', error, { fallbackMessage: 'Could not load.' });
  }
}

export async function PUT(request: Request) {
  try {
    const { actor, error } = await requireStockActor('settings');
    if (error) return error;
    if (actor.kind !== 'user') {
      return NextResponse.json({ error: 'Only the account owner can change this.', code: 'STOCK_FORBIDDEN' }, { status: 403 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path?.[0] ?? '');
      return NextResponse.json({ error: 'Check the company details.', code: 'INVALID', field }, { status: 400 });
    }
    const { logoUrl, ...fields } = parsed.data;
    if (typeof logoUrl === 'string' && !isAcceptableLogoValue(logoUrl)) {
      return NextResponse.json({ error: 'Upload a PNG, JPG or WebP image.', code: 'INVALID', field: 'logoUrl' }, { status: 400 });
    }
    const company = await prisma.company.update({
      where: { id: actor.companyId },
      data: { ...fields, ...(logoUrl !== undefined ? { logoUrl } : {}) },
      select: SELECT,
    });
    return NextResponse.json({ company, canEdit: true });
  } catch (error) {
    return handleApiError('stock:company:PUT', error, { fallbackMessage: 'Could not save.' });
  }
}

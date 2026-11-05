export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isPublicBlobUrl } from '@/lib/storage';
import { requireStockActor } from '@/lib/stock/actor';

/**
 * GET /api/stock/photo/{productId} — the product photo.
 *
 * Photos live in the public Blob store under an unguessable address; this
 * route hands that address only to someone who can read this company's
 * stock. Only Vercel Blob public addresses are redirected to, never an
 * arbitrary URL from the database.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { actor, error } = await requireStockActor('read');
  if (error) return error;
  const product = await prisma.stockProduct.findFirst({
    where: { id: params.id, companyId: actor.companyId },
    select: { photoKey: true },
  });
  const address = product?.photoKey;
  if (!isPublicBlobUrl(address)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.redirect(address, { status: 302, headers: { 'Cache-Control': 'private, max-age=3600' } });
}

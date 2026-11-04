export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';
import { requireStockActor } from '@/lib/stock/actor';

/**
 * GET /api/stock/photo/{productId} — the product photo, via a short-lived
 * signed S3 link. Photos are private; only someone who can read this
 * company's stock gets the link.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { actor, error } = await requireStockActor('read');
  if (error) return error;
  const product = await prisma.stockProduct.findFirst({
    where: { id: params.id, companyId: actor.companyId },
    select: { photoKey: true },
  });
  if (!product?.photoKey) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const url = await getFileUrl(product.photoKey, 'image/webp', false);
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

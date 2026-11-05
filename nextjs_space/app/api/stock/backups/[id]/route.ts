export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readPrivateFile } from '@/lib/storage';
import { requireStockActor } from '@/lib/stock/actor';
import { XLSX_TYPE } from '@/lib/stock/data';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/**
 * GET — download one backup. The file sits in the private store and is
 * streamed through this route, so it never has an address of its own; only
 * someone who may export this company's stock receives it.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { actor, error } = await requireStockActor('export');
  if (error) return error;
  const backup = await prisma.stockBackup.findFirst({ where: { id: params.id, companyId: actor.companyId }, select: { s3Key: true, day: true } });
  if (!backup) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const file = await readPrivateFile(backup.s3Key);
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (actor.userId && actor.role === 'viewer') {
      await recordAccountantDownload(
        { user: { id: actor.userId, email: actor.email }, companyId: actor.companyId, role: 'accountant' },
        request,
        { kind: 'stock-backup', id: params.id }
      );
    }
    return new NextResponse(file.stream, {
      status: 200,
      headers: {
        'Content-Type': XLSX_TYPE,
        'Content-Disposition': `attachment; filename="stok-yedegi-${backup.day.toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

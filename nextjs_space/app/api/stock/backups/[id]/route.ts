export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';
import { requireStockActor } from '@/lib/stock/actor';
import { XLSX_TYPE } from '@/lib/stock/data';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/** GET — download one backup through a short-lived signed link. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { actor, error } = await requireStockActor('export');
  if (error) return error;
  const backup = await prisma.stockBackup.findFirst({ where: { id: params.id, companyId: actor.companyId }, select: { s3Key: true } });
  if (!backup) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const url = await getFileUrl(backup.s3Key, XLSX_TYPE, false);
    if (actor.userId && actor.role === 'viewer') {
      await recordAccountantDownload(
        { user: { id: actor.userId, email: actor.email }, companyId: actor.companyId, role: 'accountant' },
        request,
        { kind: 'stock-backup', id: params.id }
      );
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { companyStockWorkbook, XLSX_TYPE } from '@/lib/stock/data';
import { recordAccountantDownload } from '@/lib/accountant/audit';

/** GET ?scope=all|critical — the stock as Excel, with prices (manager, accountant). */
export async function GET(request: Request) {
  try {
    const { actor, error } = await requireStockActor('export');
    if (error) return error;
    const scope = new URL(request.url).searchParams.get('scope') === 'critical' ? 'critical' : 'all';
    const { bytes } = await companyStockWorkbook(actor.companyId, scope, true);
    if (actor.userId && actor.role === 'viewer') {
      await recordAccountantDownload({ user: { id: actor.userId, email: actor.email }, companyId: actor.companyId, role: 'accountant' }, request, { kind: 'stock-export', id: scope });
    }
    const name = `kolaystok-${scope === 'critical' ? 'kritik' : 'stok'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(Buffer.from(bytes), {
      headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError('stock:export', error, { fallbackMessage: 'Could not prepare the file.' });
  }
}

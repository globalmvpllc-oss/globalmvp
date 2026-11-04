import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getStockActor } from '@/lib/stock/actor';
import { can } from '@/lib/stock/rules';
import { getQuickReasons } from '@/lib/stock/settings';
import { KsProvider, type KsSession } from '@/components/kolaystok/ks-context';
import { KsShell } from '@/components/kolaystok/ks-shell';

export const dynamic = 'force-dynamic';

/**
 * Avc KolayStok app shell. Whoever is here was resolved on the server — a
 * CorpControl account or a warehouse staff PIN session — and their
 * permissions come from the same rule every /api/stock route enforces.
 */
export default async function KolayStokLayout({ children }: { children: React.ReactNode }) {
  const result = await getStockActor();
  if (result.error) redirect('/kolaystok');
  const { actor } = result;
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { name: true, defaultCurrency: true, usageMode: true },
  });
  const quickReasons = await getQuickReasons(actor.companyId);
  const session: KsSession = {
    name: actor.name,
    kind: actor.kind,
    role: actor.role,
    companyName: company?.name ?? '',
    currency: company?.defaultCurrency ?? 'TRY',
    quickReasons,
    usageMode: company?.usageMode ?? 'finance',
    permissions: {
      prices: can(actor.role, 'read.prices'),
      move: can(actor.role, 'move'),
      count: can(actor.role, 'count'),
      products: can(actor.role, 'products.write'),
      suppliers: can(actor.role, 'suppliers.write'),
      settings: can(actor.role, 'settings'),
      orderEmail: can(actor.role, 'order.email'),
      export: can(actor.role, 'export'),
      reset: can(actor.role, 'reset') && actor.kind === 'user',
    },
  };
  return (
    <KsProvider value={session}>
      <KsShell>{children}</KsShell>
    </KsProvider>
  );
}

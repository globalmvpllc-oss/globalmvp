/**
 * Read-only: finds the company owned by an e-mail address and prints its
 * KolayStok state (mode, plan grant, products, categories, alert e-mails).
 *   npx tsx --require dotenv/config scripts/kolaystok-karadag-check.ts <email>
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) throw new Error('Give the owner e-mail.');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, createdAt: true } });
    if (!user) { console.log('No user with that e-mail.'); return; }
    const companies = await prisma.company.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true, name: true, usageMode: true, grantedPlan: true, grantedPlanUntil: true, grantedPlanReason: true, createdAt: true },
    });
    for (const c of companies) {
      const [products, withPhoto, categories, settings, low, out, movements] = await Promise.all([
        prisma.stockProduct.count({ where: { companyId: c.id, isActive: true } }),
        prisma.stockProduct.count({ where: { companyId: c.id, isActive: true, photoKey: { not: null } } }),
        prisma.stockCategory.count({ where: { companyId: c.id } }),
        prisma.stockSettings.findUnique({ where: { companyId: c.id }, select: { alertEmails: true, staffCode: true } }),
        prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM "StockProduct" WHERE "companyId" = ${c.id} AND "isActive" AND quantity > 0 AND quantity <= "minStock"`,
        prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM "StockProduct" WHERE "companyId" = ${c.id} AND "isActive" AND quantity <= 0`,
        prisma.stockMovement.count({ where: { companyId: c.id } }),
      ]);
      console.log(JSON.stringify({
        ...c, products, withPhoto, categories, movements,
        lowStock: Number(low[0].n), outOfStock: Number(out[0].n),
        alertEmails: settings?.alertEmails ?? null, hasSettings: Boolean(settings),
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

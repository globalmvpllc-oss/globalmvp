/**
 * Re-derives the status of invoices whose status claims more money than they hold.
 *
 * ## Why this exists
 *
 * Until `fix(invoices): stop an invoice being marked paid without a payment`,
 * `PUT /api/invoices/[id]` granted `{ status: 'PAID' }` by writing the field and
 * nothing else. An invoice could therefore sit at PAID with `amountPaid` at zero
 * and no Payment row behind it — settled on its own page, still fully owed on
 * the statement, the customer cards and the reports.
 *
 * The route can no longer produce such a row. Rows created before it cannot fix
 * themselves, and nothing repairs data on read: silently rewriting money records
 * because somebody opened a page is worse than the inconsistency.
 *
 * ## What it does
 *
 * Finds every invoice whose status is money-derived (PAID or PARTIALLY_PAID)
 * but whose payments do not support it, and re-derives the status from the
 * actual payment rows through `recalculateInvoicePaymentState` — the same
 * function the payment routes use, so this introduces no second opinion about
 * what a status means. An invoice marked PAID with no payments becomes SENT
 * again: it was never paid, and now it stops saying it was.
 *
 * No money is created, deleted or moved. Only `status` and the denormalised
 * `amountPaid` change, and both are re-derived from Payment rows that already
 * exist.
 *
 * ## Running it
 *
 *   npx tsx --require dotenv/config scripts/repair-invoice-status.ts
 *   npx tsx --require dotenv/config scripts/repair-invoice-status.ts --apply
 *
 * Dry run by default, and deliberately: it prints exactly what it would change
 * and writes nothing until `--apply` is passed. Read the list first.
 */
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { MONEY_DERIVED_STATUSES, deriveStatusFromPayments } from '@/lib/invoice-status';
import { recalculateInvoicePaymentState } from '@/lib/payment-calc';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const candidates = await prisma.invoice.findMany({
    where: { status: { in: [...MONEY_DERIVED_STATUSES] } },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      currency: true,
      company: { select: { name: true } },
      customer: { select: { name: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const broken: typeof candidates = [];
  for (const invoice of candidates) {
    const total = new Decimal(String(invoice.total));
    const collected = invoice.payments.reduce(
      (sum, p) => sum.plus(new Decimal(String(p.amount))),
      new Decimal(0)
    );

    // The status the payment rows actually justify.
    const derived = deriveStatusFromPayments(
      invoice.status,
      collected.toNumber(),
      total.toNumber()
    );
    if (derived !== invoice.status) broken.push(invoice);
  }

  console.log(
    `invoices in a money-derived status: ${candidates.length}\n` +
      `not supported by their payments:   ${broken.length}\n`
  );

  for (const invoice of broken) {
    const total = new Decimal(String(invoice.total));
    const collected = invoice.payments.reduce(
      (sum, p) => sum.plus(new Decimal(String(p.amount))),
      new Decimal(0)
    );
    const derived = deriveStatusFromPayments(
      invoice.status,
      collected.toNumber(),
      total.toNumber()
    );
    console.log(
      `  ${invoice.invoiceNumber}  ${invoice.company?.name ?? '?'} / ${invoice.customer?.name ?? '?'}\n` +
        `    ${invoice.currency} total=${total.toFixed(2)} amountPaid=${new Decimal(String(invoice.amountPaid)).toFixed(2)} ` +
        `payments=${invoice.payments.length} collected=${collected.toFixed(2)}\n` +
        `    status ${invoice.status} -> ${derived}`
    );
  }

  if (broken.length === 0) {
    console.log('Nothing to repair.');
    return;
  }

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply to make these changes.');
    return;
  }

  for (const invoice of broken) {
    await recalculateInvoicePaymentState(invoice.id);
    console.log(`  repaired ${invoice.invoiceNumber}`);
  }
  console.log(`\nRepaired ${broken.length} invoices.`);
}

main()
  .catch((error) => {
    console.error('FAILED:', error instanceof Error ? error.message.slice(0, 300) : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

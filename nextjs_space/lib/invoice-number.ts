import type { PrismaClient } from '@prisma/client';

/**
 * Invoice number allocation.
 *
 * The previous implementation derived the next number from `MAX(invoiceNumber)`
 * over existing rows. That has two problems: deleting the newest invoice hands
 * its number back out, and two concurrent creates had to be serialised with a
 * Serializable transaction, which made one of them fail with a write conflict
 * rather than simply taking the next number.
 *
 * The sequence now lives on `Company.invoiceNextNumber`. Allocation is a single
 * atomic `UPDATE ... SET invoiceNextNumber = invoiceNextNumber + 1 RETURNING`,
 * which takes a row lock on that company's row for the rest of the transaction.
 * A second request for the same company blocks on that lock, then reads the
 * already-incremented value — so both succeed and neither can see the same
 * number. Different companies touch different rows and never block each other.
 */

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Digits the numeric part is padded to. Matches the existing INV-0001 format. */
export const INVOICE_NUMBER_PADDING = 4;

/**
 * Builds a display number from a prefix and a sequence value.
 *
 * Numbers longer than the padding width are not truncated — a company that gets
 * past 9999 invoices should see INV-10000, not a silently mangled number.
 */
export function formatInvoiceNumber(
  prefix: string,
  sequence: number,
  padding: number = INVOICE_NUMBER_PADDING
): string {
  return `${prefix}${String(sequence).padStart(padding, '0')}`;
}

/** Guards against an unbounded scan if the sequence is far behind existing rows. */
const MAX_COLLISION_SKIPS = 1000;

/**
 * Reserves the next invoice number for a company.
 *
 * Must be called inside a transaction: the row lock taken here is what
 * serialises concurrent allocation, and it is only held until that transaction
 * commits or rolls back.
 *
 * If the invoice insert later fails, the whole transaction rolls back and the
 * sequence goes back with it — so a failed create leaves no gap. That is the
 * deliberate trade-off: gap-free numbering at the cost of holding the company
 * row lock for the duration of the insert.
 */
export async function allocateInvoiceNumber(
  tx: TxClient,
  companyId: string
): Promise<string> {
  // Atomic increment. Returns the post-increment value and locks the row.
  const company = await tx.company.update({
    where: { id: companyId },
    data: { invoiceNextNumber: { increment: 1 } },
    select: { invoicePrefix: true, invoiceNextNumber: true },
  });

  const prefix = company.invoicePrefix ?? 'INV-';
  let sequence = company.invoiceNextNumber - 1; // the value this call reserved
  let candidate = formatInvoiceNumber(prefix, sequence);

  // Invoices created before the sequence existed may already occupy a number,
  // and a company can change its prefix to one used earlier. Skipping forward
  // is safe here because the row lock means no other allocation for this
  // company can be in flight.
  let skips = 0;
  while (
    await tx.invoice.findFirst({
      where: { companyId, invoiceNumber: candidate },
      select: { id: true },
    })
  ) {
    if (++skips > MAX_COLLISION_SKIPS) {
      throw new Error(
        `Could not find a free invoice number for company ${companyId} after ${MAX_COLLISION_SKIPS} attempts`
      );
    }
    sequence += 1;
    candidate = formatInvoiceNumber(prefix, sequence);
  }

  // Park the sequence past whatever was actually used.
  if (skips > 0) {
    await tx.company.update({
      where: { id: companyId },
      data: { invoiceNextNumber: sequence + 1 },
    });
  }

  return candidate;
}

/**
 * Whether an error is a unique-constraint violation.
 *
 * Detected structurally rather than with `instanceof`, matching how
 * lib/api-error.ts identifies Prisma errors: the error class is not reliably
 * re-exported from the generated client's type namespace across versions, and
 * the shape is stable.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

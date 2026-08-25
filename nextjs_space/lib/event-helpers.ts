import { prisma } from '@/lib/db';

/**
 * Ownership checks for the optional relations an event can carry.
 *
 * Both are verified against the caller's own company before anything is
 * written. Without this, passing another company's customerId or invoiceId
 * would link a record across the tenant boundary — the same class of bug the
 * invoice and payment routes already guard against.
 *
 * Pure field shaping lives in event-fields.ts so it stays testable without a
 * database connection.
 */
export async function verifyEventRelations(
  companyId: string,
  customerId?: string | null,
  invoiceId?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!customer) return { ok: false, message: 'Customer not found' };
  }

  if (invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      select: { id: true },
    });
    if (!invoice) return { ok: false, message: 'Invoice not found' };
  }

  return { ok: true };
}

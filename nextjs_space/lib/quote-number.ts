import { formatInvoiceNumber, type TxClient } from '@/lib/invoice-number';
import { defaultQuotePrefix } from '@/lib/quote-status';

const MAX_COLLISION_SKIPS = 1000;

/**
 * Reserves the next quote number for a company, inside a transaction.
 *
 * The same scheme as invoice numbers: an atomic increment on the company row
 * (which also locks it, so concurrent quotes queue rather than collide), then
 * a skip past any number already taken.
 */
export async function allocateQuoteNumber(tx: TxClient, companyId: string): Promise<string> {
  const company = await tx.company.update({
    where: { id: companyId },
    data: { quoteNextNumber: { increment: 1 } },
    select: { quotePrefix: true, quoteNextNumber: true, country: true },
  });

  const prefix = company.quotePrefix || defaultQuotePrefix(company.country);
  let sequence = company.quoteNextNumber - 1;
  let candidate = formatInvoiceNumber(prefix, sequence);
  let skips = 0;
  while (await tx.quote.findFirst({ where: { companyId, quoteNumber: candidate }, select: { id: true } })) {
    if (++skips > MAX_COLLISION_SKIPS) throw new Error('Could not find a free quote number');
    sequence += 1;
    candidate = formatInvoiceNumber(prefix, sequence);
  }
  if (skips > 0) {
    await tx.company.update({ where: { id: companyId }, data: { quoteNextNumber: sequence + 1 } });
  }
  return candidate;
}

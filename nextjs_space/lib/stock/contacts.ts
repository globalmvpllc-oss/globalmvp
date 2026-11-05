/**
 * Email addresses for suppliers and customers, and why a "Preview" button is
 * not ready yet. Pure: used by the routes, the screens and the tests.
 */

const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/;

/** "a@x.com, b@y.com; c@z.com" → valid, lower-case, without repeats, at most 10. */
export function splitEmails(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.flatMap((v) => String(v ?? '').split(/[\s,;]+/)) : String(value ?? '').split(/[\s,;]+/);
  const out: string[] = [];
  for (const raw of parts) {
    const e = raw.trim().toLowerCase();
    if (e && EMAIL.test(e) && e.length <= 255 && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 10);
}

/**
 * Where a supplier's order emails go: the order addresses, and the general
 * address too (the CorpControl vendor form keeps one field that may hold
 * several addresses separated by commas). Nothing saved is ever lost.
 */
export function vendorEmails(vendor: { email?: string | null; orderEmails?: string[] | null } | null | undefined): string[] {
  if (!vendor) return [];
  return splitEmails([...(vendor.orderEmails ?? []), vendor.email ?? '']);
}

export function isEmailAddress(value: unknown): boolean {
  return splitEmails(value).length === 1 && String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean).length === 1;
}

/** Why "Maili önizle" is not ready for one supplier group; null when it is. */
export type Blocker = { key: string; params?: Record<string, string | number> } | null;

export function orderGroupBlocker(group: { vendorId: string | null; vendorName: string | null; emails: string[]; lines: Array<{ quantity: number }> }): Blocker {
  if (!group.vendorId) return { key: 'ks.block.noSupplier', params: { n: group.lines.length } };
  if (group.emails.length === 0) return { key: 'ks.block.vendorNoEmail', params: { name: group.vendorName ?? '' } };
  if (!group.lines.some((l) => Number.isFinite(l.quantity) && l.quantity > 0)) return { key: 'ks.block.noQuantity' };
  return null;
}

/** Why "Önizle" on a sales quote is not ready; null when it is. */
export function quoteBlocker(input: {
  customer: { email?: string | null } | null;
  lines: Array<{ quantity: number; price: number }>;
  validDays: number;
}): Blocker {
  if (!input.customer) return { key: 'ks.block.noCustomer' };
  if (!input.customer.email) return { key: 'ks.block.customerNoEmail' };
  if (input.lines.length === 0) return { key: 'ks.block.noProducts' };
  const bad = input.lines.filter((l) => !(Number.isFinite(l.quantity) && l.quantity > 0) || !(Number.isFinite(l.price) && l.price >= 0)).length;
  if (bad > 0) return { key: 'ks.block.badLines', params: { n: bad } };
  if (!(input.validDays >= 1 && input.validDays <= 365)) return { key: 'ks.block.validDays' };
  return null;
}

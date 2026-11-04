import 'server-only';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';

/** Lowercase letters and digits, never "app" (a route segment). */
export function newStaffCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const BASE_SELECT = { id: true, companyId: true, staffCode: true, alertEmails: true, senderEmail: true, senderDomainId: true, senderVerifiedAt: true } as const;

/**
 * The company's KolayStok settings row, created on first use. Columns are
 * selected explicitly so a column added by a later migration cannot break
 * this before that migration is applied.
 */
export async function ensureStockSettings(companyId: string) {
  const existing = await prisma.stockSettings.findUnique({ where: { companyId }, select: BASE_SELECT });
  if (existing) return existing;
  try {
    return await prisma.stockSettings.create({ data: { companyId, staffCode: newStaffCode() }, select: BASE_SELECT });
  } catch {
    // Two first requests at once: the other one created it.
    return prisma.stockSettings.findUniqueOrThrow({ where: { companyId }, select: BASE_SELECT });
  }
}

export const DEFAULT_QUICK_REASONS = { plus: 'receipt', minus: 'sale' } as const;

/**
 * Reasons for one-tap + / −: "Mal kabul" and "Satış" unless the manager
 * chose others.
 */
export async function getQuickReasons(companyId: string): Promise<{ plus: string; minus: string }> {
  const s = await prisma.stockSettings.findUnique({ where: { companyId }, select: { quickPlusReason: true, quickMinusReason: true } });
  return s ? { plus: s.quickPlusReason, minus: s.quickMinusReason } : { ...DEFAULT_QUICK_REASONS };
}

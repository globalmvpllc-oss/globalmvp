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

/** The company's KolayStok settings row, created on first use. */
export async function ensureStockSettings(companyId: string) {
  const existing = await prisma.stockSettings.findUnique({ where: { companyId } });
  if (existing) return existing;
  try {
    return await prisma.stockSettings.create({ data: { companyId, staffCode: newStaffCode() } });
  } catch {
    // Two first requests at once: the other one created it.
    return prisma.stockSettings.findUniqueOrThrow({ where: { companyId } });
  }
}

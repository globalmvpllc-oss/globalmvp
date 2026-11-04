import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getUserCompanyId } from '@/lib/auth-helpers';
import { pricingCurrencyFor, type PricingCurrency } from './pricing-region';

/**
 * The currency to quote this request in: TRY for a visitor in Turkey (Vercel's
 * geo header) or a signed-in company registered in Turkey, USD otherwise.
 */
export async function quoteCurrencyForRequest(companyId?: string | null): Promise<PricingCurrency> {
  const visitorCountry = headers().get('x-vercel-ip-country');
  const id = companyId === undefined ? await getUserCompanyId().catch(() => null) : companyId;
  const companyCountry = id
    ? (await prisma.company.findUnique({ where: { id }, select: { country: true } }))?.country ?? null
    : null;
  return pricingCurrencyFor({ visitorCountry, companyCountry });
}

/** The visitor's IP as the platform saw it, for Polar's checkout geolocation. */
export function requestIp(): string | undefined {
  const forwarded = headers().get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || undefined;
}

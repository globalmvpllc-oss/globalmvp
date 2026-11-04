import 'server-only';
import type { Polar } from '@polar-sh/sdk';
import { getPolarClient, BillingNotConfiguredError, describePolarError } from './polar';
import { PAID_PLANS, BILLING_INTERVALS, priceIdFor } from './plans';
import type { PlanPrice, PlanPrices, PlanPricing } from './pricing';

/**
 * Reading plan prices from Polar.
 *
 * Separated from ./pricing.ts so that the arithmetic there stays importable by
 * tests: `server-only` makes a module unresolvable outside the server, which is
 * the point for a file that touches an access token.
 */

const EMPTY: PlanPrices = { pro: {}, business: {} };

/** Picks the fixed recurring price off a Polar product. */
/**
 * The product's fixed price in one currency, or null.
 *
 * A product can carry a price per currency (Polar multi-currency: USD plus
 * TRY for Turkey). Picking "the first fixed price" would quote a US visitor
 * in lira the day a TRY price is added, so the currency is always matched.
 */
export function readPrice(product: { prices?: Array<any> } | null, currency: string = 'USD'): PlanPrice | null {
  if (!product?.prices?.length) return null;
  const wanted = currency.toLowerCase();

  const fixed = product.prices.find(
    (price) =>
      price?.amountType === 'fixed' &&
      !price?.isArchived &&
      typeof price?.priceAmount === 'number' &&
      String(price?.priceCurrency ?? 'usd').toLowerCase() === wanted
  );
  if (!fixed) return null;

  return {
    // Polar reports money in minor units, matching the webhook mapping.
    amount: fixed.priceAmount / 100,
    currency: wanted.toUpperCase(),
  };
}

/**
 * Plan prices in the preferred currency. Turkish lira is used only when every
 * plan has a TRY price in Polar; otherwise everyone sees the USD prices, so a
 * page never mixes currencies and nothing breaks before the TRY prices exist.
 */
export async function getPlanPricing(preferred: 'USD' | 'TRY' = 'USD'): Promise<PlanPricing> {
  let polar: Polar;
  try {
    polar = getPolarClient();
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return { prices: EMPTY, available: false };
    throw error;
  }

  const prices: PlanPrices = { pro: {}, business: {} };
  const tryPrices: PlanPrices = { pro: {}, business: {} };
  let available = false;
  let tryComplete = preferred === 'TRY';

  await Promise.all(
    PAID_PLANS.flatMap((plan) =>
      BILLING_INTERVALS.map(async (interval) => {
        const productId = priceIdFor(plan, interval);
        if (!productId) {
          tryComplete = false;
          return;
        }
        try {
          const product = await polar.products.get({ id: productId });
          const price = readPrice(product as { prices?: Array<any> }, 'USD');
          if (price) {
            prices[plan][interval] = price;
            available = true;
          }
          const lira = readPrice(product as { prices?: Array<any> }, 'TRY');
          if (lira) tryPrices[plan][interval] = lira;
          else tryComplete = false;
        } catch (error) {
          tryComplete = false;
          // The real Polar reason is logged (no secret can travel in it) so a
          // production "no prices" is diagnosable — a sandbox/production server
          // mismatch or a product id from the other environment shows up here.
          console.error('[billing:pricing] could not read product', {
            plan,
            interval,
            reason: describePolarError(error),
          });
        }
      })
    )
  );

  if (tryComplete) return { prices: tryPrices, available: true };
  return { prices, available };
}

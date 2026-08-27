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
function readPrice(product: { prices?: Array<any> } | null): PlanPrice | null {
  if (!product?.prices?.length) return null;

  const fixed = product.prices.find(
    (price) => price?.amountType === 'fixed' && !price?.isArchived && typeof price?.priceAmount === 'number'
  );
  if (!fixed) return null;

  return {
    // Polar reports money in minor units, matching the webhook mapping.
    amount: fixed.priceAmount / 100,
    currency: typeof fixed.priceCurrency === 'string' ? fixed.priceCurrency.toUpperCase() : 'USD',
  };
}

/**
 * Loads every configured plan price.
 *
 * Failures are swallowed deliberately: a pricing panel is not worth taking the
 * billing page down for, and the caller renders the plans without figures when
 * nothing came back.
 */
export async function getPlanPricing(): Promise<PlanPricing> {
  let polar: Polar;
  try {
    polar = getPolarClient();
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return { prices: EMPTY, available: false };
    throw error;
  }

  const prices: PlanPrices = { pro: {}, business: {} };
  let available = false;

  await Promise.all(
    PAID_PLANS.flatMap((plan) =>
      BILLING_INTERVALS.map(async (interval) => {
        const productId = priceIdFor(plan, interval);
        if (!productId) return;
        try {
          const product = await polar.products.get({ id: productId });
          const price = readPrice(product as { prices?: Array<any> });
          if (price) {
            prices[plan][interval] = price;
            available = true;
          }
        } catch (error) {
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

  return { prices, available };
}

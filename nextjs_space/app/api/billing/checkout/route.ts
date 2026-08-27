export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getPolarClient, getAppBaseUrl, BillingNotConfiguredError, describePolarError } from '@/lib/billing/polar';
import { isPaidPlan, isBillingInterval, priceIdFor } from '@/lib/billing/plans';

/**
 * Starts a Polar checkout for the signed-in user's company.
 *
 * The client sends a plan name and an interval — nothing else. The price id is
 * resolved server-side from the environment, so a caller cannot pay the Pro
 * price for the Business plan by naming a cheaper price, and cannot supply a
 * checkout URL of their own.
 *
 * companyId comes from the session and is written into the checkout metadata.
 * That metadata is how the webhook later attributes the subscription, which is
 * why it must originate here rather than from the browser.
 */
export async function POST(request: Request) {
  try {
    const { error, user, companyId } = await requireUserCompany();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const plan = (body as Record<string, unknown> | null)?.plan;
    const interval = (body as Record<string, unknown> | null)?.interval ?? 'month';

    // Strict allowlist. Anything outside it is rejected before Polar is called.
    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: 'Choose one of the available plans.' }, { status: 400 });
    }
    if (!isBillingInterval(interval)) {
      return NextResponse.json({ error: 'Choose a monthly or yearly plan.' }, { status: 400 });
    }

    const productId = priceIdFor(plan, interval);
    if (!productId) {
      return NextResponse.json(
        { error: 'Billing is not available yet. Please try again later.' },
        { status: 503 }
      );
    }

    const polar = getPolarClient();
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${getAppBaseUrl()}/settings/billing?checkout=success`,
      customerEmail: user.email ?? undefined,
      // Ties the Polar customer to this company across future checkouts.
      externalCustomerId: companyId,
      metadata: { companyId },
    });

    if (!checkout?.url) {
      console.error('[billing:checkout] Polar accepted the request but returned no checkout url', {
        plan,
        interval,
      });
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      // The specific variable is logged, never returned.
      console.error('[billing:checkout]', error.message);
      return NextResponse.json(
        { error: 'Billing is not available yet. Please try again later.' },
        { status: 503 }
      );
    }
    // Log the real Polar reason so a production checkout failure is diagnosable
    // from the server logs. No token or secret can travel in this line, and the
    // client still receives only the generic message below.
    console.error('[billing:checkout] Polar rejected the checkout:', describePolarError(error));
    return handleApiError('billing:checkout', error, {
      fallbackMessage: 'Could not start checkout. Please try again.',
    });
  }
}

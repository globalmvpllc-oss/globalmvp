export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getPolarClient, BillingNotConfiguredError, describePolarError } from '@/lib/billing/polar';
import { planForConfiguredId } from '@/lib/billing/plans';

/**
 * Whether a checkout this company started has been paid.
 *
 * Polar returns the browser to `/settings/billing?checkout_id=…` after payment.
 * The id in that URL is only a claim, so the purchase conversion is reported
 * only after this route has asked Polar and Polar says `succeeded` — a visitor
 * editing the URL, or reloading the page, cannot mint a sale.
 *
 * The checkout must belong to the signed-in company (we set both the external
 * customer id and the metadata to the companyId when creating it). Anything
 * else answers 404, the same as an id that does not exist.
 *
 * Returns only what a conversion needs: id, amount, currency, plan. No name,
 * email or address leaves this route.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const id = new URL(request.url).searchParams.get('id') ?? '';
    // Polar checkout ids are short opaque tokens; anything else is not worth a call.
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const polar = getPolarClient();
    let checkout;
    try {
      checkout = await polar.checkouts.get({ id });
    } catch (lookupError) {
      console.warn('[billing:checkout-status] lookup failed:', describePolarError(lookupError));
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const owner = checkout.externalCustomerId ?? checkout.metadata?.companyId;
    if (owner !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (checkout.status !== 'succeeded') {
      // 'confirmed' means the payment is still being processed; the client
      // asks again shortly. Nothing about the purchase is returned yet.
      return NextResponse.json({ status: checkout.status });
    }

    const selection = planForConfiguredId(checkout.productId);
    return NextResponse.json({
      status: 'succeeded',
      transactionId: checkout.id,
      value: checkout.totalAmount / 100,
      currency: String(checkout.currency).toUpperCase(),
      plan: selection?.plan ?? null,
      interval: selection?.interval ?? null,
    });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      console.error('[billing:checkout-status]', error.message);
      return NextResponse.json({ error: 'Billing is not available yet.' }, { status: 503 });
    }
    return handleApiError('billing:checkout-status', error, {
      fallbackMessage: 'Could not check the payment. Please refresh the page.',
    });
  }
}

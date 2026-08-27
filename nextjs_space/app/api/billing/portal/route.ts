export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { getPolarClient, BillingNotConfiguredError, describePolarError } from '@/lib/billing/polar';

/**
 * Opens the Polar customer portal for the signed-in user's company.
 *
 * The Polar customer id is read from this company's own subscription row, never
 * from the request: a caller cannot name someone else's customer and be handed
 * a session that manages their payment method.
 */
export async function POST() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      select: { polarCustomerId: true },
    });

    if (!subscription?.polarCustomerId) {
      return NextResponse.json(
        { error: 'There is no subscription to manage yet.' },
        { status: 404 }
      );
    }

    const polar = getPolarClient();
    const session = await polar.customerSessions.create({
      customerId: subscription.polarCustomerId,
    });

    if (!session?.customerPortalUrl) {
      return NextResponse.json(
        { error: 'Could not open the billing portal. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.customerPortalUrl });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      console.error('[billing:portal]', error.message);
      return NextResponse.json(
        { error: 'Billing is not available yet. Please try again later.' },
        { status: 503 }
      );
    }
    console.error('[billing:portal] Polar rejected the portal session:', describePolarError(error));
    return handleApiError('billing:portal', error, {
      fallbackMessage: 'Could not open the billing portal. Please try again.',
    });
  }
}

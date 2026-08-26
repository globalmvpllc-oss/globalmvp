export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';

/**
 * The signed-in company's subscription, or null when it is on the Free plan.
 *
 * Scoped by the session's companyId, so one company can never read another's.
 * The select list is explicit: provider ids other than what the UI needs are
 * left out, and nothing here is a secret in its own right.
 */
export async function GET() {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      select: {
        plan: true,
        status: true,
        interval: true,
        currency: true,
        amount: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        trialEndsAt: true,
      },
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    return handleApiError('billing:subscription', error, {
      fallbackMessage: 'Could not load your subscription. Please try again.',
    });
  }
}

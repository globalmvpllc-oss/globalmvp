export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';

/**
 * One vendor, for the vendor detail page.
 *
 * Read only. Vendors are still created from the expense dialog and there is no
 * edit or delete screen yet, so this route deliberately offers no PUT or
 * DELETE: an unused write endpoint is attack surface with no feature behind it.
 * Deletion in particular needs the same guard the customer route has —
 * ExpenseTransaction.vendorId is ON DELETE SET NULL, so removing a vendor would
 * orphan its expense history — and that belongs with the screen that offers it.
 *
 * Scoped by `{ id, companyId }` from the session. The id in the URL is not
 * authorisation.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const vendor = await prisma.vendor.findFirst({
      where: { id: params.id, companyId },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        country: true,
        taxId: true,
        notes: true,
        createdAt: true,
        _count: { select: { expenseTransactions: true } },
      },
    });
    if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(vendor);
  } catch (error) {
    return handleApiError('vendors:GET:id', error, { fallbackMessage: 'Failed to load vendor' });
  }
}

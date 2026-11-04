export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarRange } from '@/lib/calendar-range';
import { loadReportsPayload } from '@/lib/reports-data';

/**
 * Reports API — every figure summed by Postgres.
 *
 * The reports page used to fetch /api/income, /api/expenses and
 * /api/invoices?take=200 and reduce them in the browser. Those endpoints are
 * paginated, so a company past a page limit had its totals computed from a
 * partial list: the page carried a banner admitting the figures might be
 * incomplete. Aggregating here removes the possibility rather than warning
 * about it — no row is ever loaded to be added up.
 *
 * companyId comes from the session via `requireUserCompany`, never from the
 * query, so every aggregate below is scoped to the caller's own tenant.
 *
 * Like the other read endpoints (`income:GET`, `invoices:GET`) this does not
 * call `enforcePlanLimit`: plan limits gate what a company may create, not what
 * it may look at, and metering a read would lock a company out of its own
 * figures.
 *
 * ## Which dates are filtered
 *
 * `from`/`to` are parsed by `parseCalendarRange`, the same half-open,
 * UTC-pinned convention the list endpoints use. They are applied to:
 *
 *   income, expenses — `date`, the day the money moved. Not the calendar's
 *     `expectedPaymentDate ?? date`: that exists so the calendar can draw a
 *     record on the day it is expected, whereas a report is about what actually
 *     happened, and the monthly chart already buckets on `date`.
 *   invoices — `issueDate`, the day the invoice was raised. Not `dueDate`,
 *     which is what the calendar filters on, because "invoiced in August" means
 *     raised in August.
 *
 * Without either bound the behaviour matches what the page did before: every
 * record the company has.
 *
 * ## Which records count
 *
 *   income     RECEIVED only
 *   expenses   PAID only — the total, the monthly series and the category pie
 *   invoices   issued only, for invoiced and collected
 *
 * The invoice line used to read "every status, drafts included", preserved
 * verbatim from the browser-side arithmetic this endpoint replaced so that no
 * figure would move during that refactor. It was wrong then and it moved a
 * figure now: a draft has never been issued to anybody, so counting one as
 * invoiced — and therefore as outstanding — reports money nobody owes. It now
 * reads `ISSUED_INVOICE_STATUSES`, the same definition the customer cards, the
 * account statement and the dashboard use.
 *
 * The invoice *status* pie below is deliberately left counting every status:
 * its whole job is to show how many invoices are sitting in draft, and
 * filtering them out would empty the slice that matters most.
 *
 * The expense-category pie used to count every status, so its slices added up
 * to more than the total printed above them. It now counts PAID like everything
 * else on the page. What is recorded but unpaid is fetched separately and shown
 * as a note beside the pie rather than mixed into it — see that query.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { range, error: rangeError } = parseCalendarRange(searchParams);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const payload = await loadReportsPayload(companyId, range);

    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError('reports:GET', error, { fallbackMessage: 'Failed to load reports' });
  }
}

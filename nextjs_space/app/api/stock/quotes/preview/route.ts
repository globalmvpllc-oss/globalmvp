export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';
import { requireStockActor } from '@/lib/stock/actor';
import { translate } from '@/lib/i18n';
import { documentLocaleFor } from '@/lib/tr-tax';
import { pdfResponse } from '@/lib/pdf/response';
import { draftQuote, quoteInputSchema, quoteMail, renderStockQuotePdf } from '@/lib/stock/quotes';

const DRAFT_STATUS = { CUSTOMER_NOT_FOUND: 404, NO_EMAIL: 400, NO_LINES: 400 } as const;

/**
 * POST (the quote being prepared) — what would be sent, nothing saved:
 * JSON with the email (to, from, reply-to, subject, text) and totals, or with
 * ?format=pdf the PDF itself, numbered "TASLAK".
 */
export async function POST(request: Request) {
  try {
    const { actor, error } = await requireStockActor('sales.quote');
    if (error) return error;
    const parsed = quoteInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the quote.', code: 'INVALID' }, { status: 400 });
    const draft = await draftQuote(actor.companyId, parsed.data);
    if (draft.error) return NextResponse.json({ error: draft.error, code: draft.error }, { status: DRAFT_STATUS[draft.error] });
    const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { country: true } });
    const locale = documentLocaleFor(draft.customer, company);
    const preview = {
      quoteNumber: translate(locale, 'ks.quote.previewNumber'),
      issueDate: draft.issueDate,
      validUntil: draft.validUntil,
      currency: 'TRY',
      subtotal: draft.subtotal,
      taxTotal: draft.taxTotal,
      total: draft.total,
      notes: draft.note,
      customer: draft.customer,
      items: draft.items,
    };
    if (new URL(request.url).searchParams.get('format') === 'pdf') {
      const pdf = await renderStockQuotePdf(actor.companyId, preview, draft.addVat);
      return pdfResponse(pdf, 'teklif-taslak.pdf');
    }
    const mail = await quoteMail(actor.companyId, preview);
    return NextResponse.json({
      to: mail.to,
      from: mail.from,
      replyTo: mail.replyTo,
      subject: mail.email.subject,
      text: mail.email.text,
      subtotal: Number(draft.subtotal),
      taxTotal: Number(draft.taxTotal),
      total: Number(draft.total),
      validUntil: draft.validUntil,
      overStock: draft.items.filter((i) => i.overStock).map((i) => i.stockProductId),
    });
  } catch (error) {
    return handleApiError('stock:quotes:preview', error, { fallbackMessage: 'Could not prepare the preview.' });
  }
}

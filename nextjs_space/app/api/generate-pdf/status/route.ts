export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { verifyPdfToken } from '@/lib/pdf-token';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { token } = await request.json();

    // Plain request_id values are no longer accepted. Previously this endpoint
    // took any request_id and returned the resulting PDF, so any authenticated
    // user who knew another company's id could download their invoice.
    const verified = verifyPdfToken(token);
    if (!verified.ok) {
      const message =
        verified.reason === 'expired'
          ? 'PDF request has expired. Please generate it again.'
          : 'Invalid PDF request token';
      return NextResponse.json({ status: 'FAILED', error: message }, { status: 400 });
    }

    // Ownership check: the token must have been issued to the caller's company.
    if (verified.companyId !== companyId) {
      return NextResponse.json({ status: 'FAILED', error: 'Not found' }, { status: 404 });
    }

    if (!process.env.ABACUSAI_API_KEY) {
      return NextResponse.json(
        { status: 'FAILED', error: 'PDF service is not configured' },
        { status: 503 }
      );
    }

    const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({ request_id: verified.requestId }),
    });

    if (!statusResponse.ok) {
      return NextResponse.json({ status: 'FAILED', error: 'Failed to check status' }, { status: 502 });
    }

    const statusResult = await statusResponse.json();
    const status = statusResult?.status || 'FAILED';
    const result = statusResult?.result || null;

    if (status === 'SUCCESS') {
      if (result?.result) return NextResponse.json({ status, pdf_base64: result.result });
      return NextResponse.json({ status: 'FAILED', error: 'No result data' });
    }
    if (status === 'FAILED') {
      return NextResponse.json({ status, error: 'PDF generation failed' });
    }
    return NextResponse.json({ status });
  } catch (error) {
    return handleApiError('generate-pdf:status', error, { fallbackMessage: 'Failed to check status' });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';
import { createPdfToken } from '@/lib/pdf-token';
import { handleApiError } from '@/lib/api-error';
import { enforcePlanLimit } from '@/lib/billing/limits';

/** Upper bound on submitted markup. A generous invoice renders well under this. */
const MAX_HTML_BYTES = 512 * 1024; // 512 KB
const MAX_CSS_BYTES = 64 * 1024; // 64 KB

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    // Plan limit, enforced server-side. The plan is read from this company's
    // subscription, so a request body claiming a different one changes nothing.
    const denied = await enforcePlanLimit(companyId, 'invoicePdfPerMonth');
    if (denied) return denied;

    const { html_content, pdf_options, css_stylesheet } = await request.json();

    if (!html_content || typeof html_content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'html_content is required' },
        { status: 400 }
      );
    }
    if (byteLength(html_content) > MAX_HTML_BYTES) {
      return NextResponse.json(
        { success: false, error: 'html_content exceeds the maximum allowed size' },
        { status: 413 }
      );
    }
    if (css_stylesheet !== undefined && css_stylesheet !== null) {
      if (typeof css_stylesheet !== 'string' || byteLength(css_stylesheet) > MAX_CSS_BYTES) {
        return NextResponse.json(
          { success: false, error: 'css_stylesheet is invalid or too large' },
          { status: 400 }
        );
      }
    }

    if (!process.env.ABACUSAI_API_KEY) {
      // Never echo which variable is missing beyond this generic message.
      return NextResponse.json(
        { success: false, error: 'PDF service is not configured' },
        { status: 503 }
      );
    }

    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        html_content,
        pdf_options: pdf_options || { format: 'A4' },
        css_stylesheet,
      }),
    });

    if (!createResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to create PDF request' },
        { status: 502 }
      );
    }

    const { request_id } = await createResponse.json();
    if (!request_id || typeof request_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Failed to create PDF request' },
        { status: 502 }
      );
    }

    // The raw Abacus request_id is never handed to the client. It is wrapped in
    // an HMAC-signed token that binds it to this company (and an expiry), so the
    // status endpoint can prove ownership without a database record.
    const token = createPdfToken(request_id, companyId);

    return NextResponse.json({ success: true, token });
  } catch (error) {
    return handleApiError('generate-pdf:POST', error, {
      fallbackMessage: 'Failed to create PDF request',
    });
  }
}

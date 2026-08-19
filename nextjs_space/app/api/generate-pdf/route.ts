export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';

export async function POST(request: Request) {
  try {
    const { error } = await requireUserCompany();
    if (error) return error;

    const { html_content, pdf_options, css_stylesheet } = await request.json();
    if (!html_content || typeof html_content !== 'string') {
      return NextResponse.json({ success: false, error: 'html_content is required' }, { status: 400 });
    }

    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({ html_content, pdf_options: pdf_options || { format: 'A4' }, css_stylesheet }),
    });
    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({ error: 'Failed to create PDF request' }));
      return NextResponse.json({ success: false, error: err?.error }, { status: 500 });
    }
    const { request_id } = await createResponse.json();
    if (!request_id) return NextResponse.json({ success: false, error: 'No request ID returned' }, { status: 500 });
    return NextResponse.json({ success: true, request_id });
  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create PDF request' }, { status: 500 });
  }
}

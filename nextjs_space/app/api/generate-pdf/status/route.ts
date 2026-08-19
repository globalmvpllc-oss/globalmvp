export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserCompany } from '@/lib/auth-helpers';

export async function POST(request: Request) {
  try {
    const { error } = await requireUserCompany();
    if (error) return error;

    const { request_id } = await request.json();
    if (!request_id || typeof request_id !== 'string') {
      return NextResponse.json({ status: 'FAILED', error: 'request_id is required' }, { status: 400 });
    }

    const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({ request_id }),
    });
    const statusResult = await statusResponse.json();
    const status = statusResult?.status || 'FAILED';
    const result = statusResult?.result || null;
    if (status === 'SUCCESS') {
      if (result?.result) return NextResponse.json({ status, pdf_base64: result.result });
      return NextResponse.json({ status: 'FAILED', error: 'No result data' });
    }
    if (status === 'FAILED') return NextResponse.json({ status, error: result?.error || 'PDF generation failed' });
    return NextResponse.json({ status });
  } catch (error: any) {
    console.error('PDF status error:', error);
    return NextResponse.json({ status: 'FAILED', error: 'Failed to check status' }, { status: 500 });
  }
}

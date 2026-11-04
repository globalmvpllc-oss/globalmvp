import 'server-only';

/**
 * HTML → PDF on the server, through the same service the invoice page's
 * "PDF" button uses (ABACUSAI_API_KEY). The browser flow polls from the
 * client; this one polls here so a route can attach the file to an email.
 *
 * Returns null whenever a PDF could not be produced — not configured, the
 * service refused, or it did not finish in time. Callers must then not claim
 * the document was sent.
 */
const CREATE_URL = 'https://apps.abacus.ai/api/createConvertHtmlToPdfRequest';
const STATUS_URL = 'https://apps.abacus.ai/api/getConvertHtmlToPdfStatus';

export const INVOICE_PDF_OPTIONS = {
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
};

export function isPdfServiceConfigured(): boolean {
  return Boolean(process.env.ABACUSAI_API_KEY);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function renderPdf(
  html: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<Buffer | null> {
  const key = process.env.ABACUSAI_API_KEY;
  if (!key) return null;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const timeoutMs = options.timeoutMs ?? 40_000;
  const intervalMs = options.intervalMs ?? 2_000;

  try {
    const created = await fetch(CREATE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ html_content: html, pdf_options: INVOICE_PDF_OPTIONS }),
    });
    if (!created.ok) return null;
    const { request_id } = await created.json();
    if (!request_id || typeof request_id !== 'string') return null;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(intervalMs);
      const res = await fetch(STATUS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ request_id }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      if (body?.status === 'SUCCESS') {
        const b64 = body?.result?.result;
        return typeof b64 === 'string' && b64 ? Buffer.from(b64, 'base64') : null;
      }
      if (body?.status === 'FAILED') return null;
    }
    return null;
  } catch (error) {
    console.error('[pdf-service] render failed', { name: (error as { name?: string })?.name });
    return null;
  }
}

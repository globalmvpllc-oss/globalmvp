import { createZip, safeEntryName, archiveName, type ZipEntry } from '@/lib/zip';

/**
 * Turning several invoices into one ZIP.
 *
 * The per-invoice work is exactly what the single download does: the same
 * `generateInvoiceHtml` output, posted to the same `/api/generate-pdf`, polled
 * at the same `/api/generate-pdf/status`. That is deliberate — a bulk file that
 * differs from the one-at-a-time file would be a second PDF format to maintain,
 * and the two would drift.
 *
 * Sequential rather than parallel. The generator is an external service and the
 * monthly PDF allowance is enforced per request; firing twenty at once would
 * hammer the first and make the second fail in a confusing order.
 */

/** Same options the single download sends, so the output matches page for page. */
export const PDF_OPTIONS = {
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
} as const;

/** Upper bound on one batch. Beyond this the wait stops being reasonable. */
export const MAX_BULK_PDFS = 25;

/** How long to wait for one PDF before giving up on it. */
const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 40;

export interface BulkPdfItem {
  /** Used for the file name inside the archive. */
  name: string;
  html: string;
}

export type BulkFailureReason =
  | 'not-configured'
  | 'limit-reached'
  | 'rejected'
  | 'timeout'
  | 'network';

export interface BulkPdfResult {
  zip: Uint8Array | null;
  fileName: string;
  succeeded: string[];
  failed: Array<{ name: string; reason: BulkFailureReason }>;
  /** Set when the run stopped early rather than merely skipping an item. */
  stoppedBecause: BulkFailureReason | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Produces one PDF, or a reason it could not be produced.
 *
 * Exported so anything else that needs a single PDF — the account statement —
 * goes through this exact create/poll flow rather than growing a second one.
 * The bulk run below is this function in a loop.
 */
export async function generateSinglePdf(
  html: string,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array } | { reason: BulkFailureReason }> {
  let createRes: Response;
  try {
    createRes = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html_content: html, pdf_options: PDF_OPTIONS }),
      signal,
    });
  } catch {
    return { reason: 'network' };
  }

  // 503: no PDF service configured. 402: the plan's monthly PDF allowance is
  // spent. Neither is worth retrying for the remaining invoices.
  if (createRes.status === 503) return { reason: 'not-configured' };
  if (createRes.status === 402) return { reason: 'limit-reached' };
  if (!createRes.ok) return { reason: 'rejected' };

  const created = await createRes.json().catch(() => null);
  if (!created?.success || !created?.token) return { reason: 'rejected' };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { reason: 'network' };
    await sleep(POLL_INTERVAL_MS);

    let statusRes: Response;
    try {
      statusRes = await fetch('/api/generate-pdf/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: created.token }),
        signal,
      });
    } catch {
      return { reason: 'network' };
    }

    const status = await statusRes.json().catch(() => null);
    if (status?.status === 'SUCCESS' && status?.pdf_base64) {
      return { bytes: base64ToBytes(status.pdf_base64) };
    }
    if (status?.status === 'FAILED') return { reason: 'rejected' };
  }

  return { reason: 'timeout' };
}

/**
 * Generates PDFs for the given invoices and packs them into one archive.
 *
 * A single bad invoice does not sink the batch: it is recorded and the run
 * continues. Two conditions do stop it, because continuing would only repeat
 * the same failure — the PDF service being unconfigured, and the monthly
 * allowance running out.
 */
export async function generateBulkPdfZip(
  items: BulkPdfItem[],
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
    now?: Date;
    prefix?: string;
  } = {}
): Promise<BulkPdfResult> {
  const batch = items.slice(0, MAX_BULK_PDFS);
  const entries: ZipEntry[] = [];
  const succeeded: string[] = [];
  const failed: BulkPdfResult['failed'] = [];
  let stoppedBecause: BulkFailureReason | null = null;

  for (let index = 0; index < batch.length; index++) {
    const item = batch[index];
    const outcome = await generateSinglePdf(item.html, options.signal);

    if ('bytes' in outcome) {
      entries.push({
        name: safeEntryName(`${item.name}.pdf`, `invoice-${index + 1}.pdf`),
        data: outcome.bytes,
      });
      succeeded.push(item.name);
    } else {
      failed.push({ name: item.name, reason: outcome.reason });
      if (outcome.reason === 'not-configured' || outcome.reason === 'limit-reached') {
        stoppedBecause = outcome.reason;
        // Everything not yet attempted is recorded for the same reason, so the
        // caller can say how many were left out.
        for (let rest = index + 1; rest < batch.length; rest++) {
          failed.push({ name: batch[rest].name, reason: outcome.reason });
        }
        break;
      }
    }

    options.onProgress?.(index + 1, batch.length);
  }

  return {
    // No archive at all when nothing succeeded: an empty ZIP is a confusing
    // thing to hand someone.
    zip: entries.length > 0 ? createZip(entries) : null,
    fileName: archiveName(options.prefix ?? 'invoices', options.now),
    succeeded,
    failed,
    stoppedBecause,
  };
}

/** Hands the archive to the browser. */
export function downloadZip(zip: Uint8Array, fileName: string) {
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

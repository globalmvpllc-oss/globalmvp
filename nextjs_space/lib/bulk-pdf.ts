import { createZip, safeEntryName, archiveName, type ZipEntry } from '@/lib/zip';

/**
 * Turning several invoices into one ZIP.
 *
 * The per-invoice work is exactly what the single download does: the same
 * server-built PDF from `/api/invoices/[id]/pdf`. A bulk file that differed
 * from the one-at-a-time file would be a second PDF format to maintain.
 *
 * Sequential rather than parallel: the monthly PDF allowance is enforced per
 * request, and twenty at once would make it fail in a confusing order.
 */

/** Page settings of every generated document (see lib/pdf/page.ts). */
export { PDF_OPTIONS } from '@/lib/pdf/page';

/** Upper bound on one batch. Beyond this the wait stops being reasonable. */
export const MAX_BULK_PDFS = 25;

export interface BulkPdfItem {
  /** Used for the file name inside the archive. */
  name: string;
  /** The invoice id; the server renders it. */
  id: string;
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

/**
 * Downloads one server-built PDF, or says why it could not.
 *
 * Exported so anything else that needs a single PDF — the invoice page, the
 * account statement — uses the same request and the same failure reasons.
 * 402 means the plan's monthly PDF allowance is spent.
 */
export async function fetchPdf(
  url: string,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array } | { reason: BulkFailureReason }> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    return { reason: 'network' };
  }
  if (res.status === 402) return { reason: 'limit-reached' };
  if (!res.ok) return { reason: 'rejected' };
  try {
    return { bytes: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return { reason: 'network' };
  }
}

/** The PDF of one invoice. */
export function fetchInvoicePdf(id: string, signal?: AbortSignal) {
  return fetchPdf(`/api/invoices/${encodeURIComponent(id)}/pdf`, signal);
}

/** Saves bytes as a file in the browser. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type = 'application/pdf') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked later: Safari and Firefox start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Generates PDFs for the given invoices and packs them into one archive.
 *
 * A single bad invoice does not sink the batch: it is recorded and the run
 * continues. Running out of the monthly allowance stops it, because
 * continuing would only repeat the same failure.
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
    const outcome = await fetchInvoicePdf(item.id, options.signal);

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
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked later: Safari and Firefox start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

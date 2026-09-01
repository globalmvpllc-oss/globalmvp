'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileArchive } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/i18n-provider';
import { generateInvoiceHtml } from '@/lib/invoice-html';
import { resolveStoredFileUrl } from '@/lib/company-identity';
import { generateBulkPdfZip, downloadZip, MAX_BULK_PDFS } from '@/lib/bulk-pdf';
import type { TranslationKey } from '@/lib/i18n';

/**
 * Bulk PDF download for the selected invoices.
 *
 * Each invoice goes through exactly the flow the single download uses — the
 * same `generateInvoiceHtml`, the same endpoint — so the file inside the
 * archive is the file the user would have got one at a time.
 *
 * Company isolation is unchanged: the invoices come from the list this page
 * already loaded through the company-scoped API, and the PDF endpoint takes
 * markup rather than an id, so there is no id a caller could substitute to
 * reach another company's data.
 */
export function BulkPdfButton({
  invoices,
  selectedIds,
  company,
  className,
}: {
  invoices: any[];
  selectedIds: string[];
  company: any;
  /** Lets the caller size the button — full width on a phone, auto elsewhere. */
  className?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const fill = (key: TranslationKey, values: Record<string, string | number>) =>
    Object.entries(values).reduce<string>(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      t(key)
    );

  const run = async () => {
    if (selectedIds.length === 0) {
      toast.error(t('bulk.selectAtLeastOne'));
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: Math.min(selectedIds.length, MAX_BULK_PDFS) });

    try {
      if (selectedIds.length > MAX_BULK_PDFS) {
        toast.message(fill('bulk.maxPerBatch', { max: MAX_BULK_PDFS }));
      }

      // Resolved once for the whole batch rather than per invoice: the logo is
      // the same on every page and fetching it repeatedly is wasted work.
      const logoDataUrl = await resolveStoredFileUrl(company?.logoUrl).catch(() => null);

      const chosen = invoices.filter((invoice: any) => selectedIds.includes(invoice?.id));
      const items = chosen.map((invoice: any) => ({
        name: invoice?.invoiceNumber ?? 'invoice',
        html: generateInvoiceHtml(invoice, company, logoDataUrl),
      }));

      const result = await generateBulkPdfZip(items, {
        onProgress: (done, total) => setProgress({ done, total }),
      });

      if (result.stoppedBecause === 'not-configured') {
        toast.error(t('bulk.notConfigured'));
      } else if (result.stoppedBecause === 'limit-reached') {
        toast.error(t('bulk.limitReached'));
      }

      if (!result.zip) {
        if (!result.stoppedBecause) toast.error(t('bulk.noneGenerated'));
        return;
      }

      downloadZip(result.zip, result.fileName);
      toast.success(fill('bulk.downloaded', { count: result.succeeded.length }));

      // A partial batch is reported rather than passed off as a full one.
      const skipped = result.failed.length;
      if (skipped > 0 && !result.stoppedBecause) {
        toast.message(fill('bulk.someFailed', { count: skipped }));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const label = busy
    ? progress && progress.total > 1
      ? `${t('bulk.generating')} ${progress.done}/${progress.total}`
      : t('bulk.generating')
    : t('bulk.bulkDownloadPdf');

  return (
    <Button
      variant="outline"
      className={className}
      onClick={run}
      // Enabled with nothing selected on purpose: pressing it explains what to
      // do, which is friendlier than a dead control with no reason given.
      disabled={busy || invoices.length === 0}
    >
      <FileArchive className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

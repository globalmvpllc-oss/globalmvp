'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/i18n-provider';
import { fetchPdf, downloadBytes } from '@/lib/bulk-pdf';
import type { ListPdfKind } from '@/lib/pdf/list-pdf';

/**
 * "PDF indir" for a list or report screen.
 *
 * `params` is the filter the screen is showing right now, in the same names
 * the screen sends to its own API; the server applies it again, so the PDF
 * lists exactly what is on screen. These PDFs do not use the plan's monthly
 * PDF allowance.
 */
export function ListPdfButton({
  kind,
  params,
  className,
}: {
  kind: ListPdfKind;
  params?: Record<string, string | null | undefined>;
  className?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== null && value !== undefined && value !== '' && value !== 'ALL') query.set(key, value);
      }
      const qs = query.toString();
      const outcome = await fetchPdf(`/api/pdf/${kind}${qs ? `?${qs}` : ''}`);
      if ('bytes' in outcome) {
        downloadBytes(outcome.bytes, `corpcontrol-${kind}-${new Date().toISOString().slice(0, 10)}.pdf`);
        toast.success(t('listPdf.downloaded'));
      } else {
        toast.error(t('listPdf.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" className={className} onClick={run} disabled={busy}>
      <FileDown className="mr-2 h-4 w-4" />
      {busy ? t('listPdf.preparing') : t('listPdf.download')}
    </Button>
  );
}

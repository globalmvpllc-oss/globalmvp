'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/components/i18n-provider';
import { downloadBytes } from '@/lib/bulk-pdf';

/**
 * "Export" → Excel or CSV for one dataset. The server builds the file from
 * this company's records; a plan without data export gets a clear message.
 */
export function ExportMenu({
  dataset,
  from,
  to,
  className,
}: {
  dataset: 'invoices' | 'customers' | 'income' | 'expenses' | 'payments' | 'quotes' | 'vat';
  from?: string;
  to?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const run = async (format: 'xlsx' | 'csv') => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ format });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const res = await fetch(`/api/export/${dataset}?${query}`);
      if (res.status === 402) {
        toast.error(t('export.needsPro'));
        return;
      }
      if (!res.ok) {
        toast.error(t('export.failed'));
        return;
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${dataset}.${format}`;
      downloadBytes(
        new Uint8Array(await res.arrayBuffer()),
        name,
        format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      toast.success(t('export.done'));
    } catch {
      toast.error(t('error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className} disabled={busy}>
          <Download className="mr-2 h-4 w-4" /> {busy ? t('export.preparing') : t('export.button')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run('xlsx')}>{t('export.excel')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('csv')}>{t('export.csv')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

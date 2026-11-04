'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/components/i18n-provider';
import { formatCurrency } from '@/lib/currencies';
import { displayTaxLabel } from '@/lib/tr-tax';
import { documentTotalsLines, hasLineDiscount, lineNetAmount, rateText } from '@/lib/document-lines';

/**
 * Line items and totals of an invoice or quote, laid out exactly like the PDF
 * (lib/document-lines): "Amount" is before VAT and after the line discount,
 * the discount column shows only when a line has one, and the totals read
 * subtotal, discount, VAT per rate, grand total. Display only — the stored
 * totals are printed unchanged.
 *
 * `children` go under the grand total (e.g. the paid amount on an invoice).
 */
export function DocumentLines({ doc, currency, children }: { doc: any; currency: string; children?: ReactNode }) {
  const { t, locale } = useI18n();
  const lang = locale === 'tr' ? 'tr' : 'en';
  const money = (value: unknown) => formatCurrency(Number(value ?? 0), currency);
  const items: any[] = doc?.items ?? [];
  const withDiscount = hasLineDiscount(items);

  return (
    <>
      {/* The table scrolls inside this box; the page itself does not. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-base">
          <thead>
            <tr className="border-b text-sm text-muted-foreground">
              <th className="py-2 text-left font-medium">{t('common.description')}</th>
              <th className="py-2 text-right font-medium">{t('invoices.qty')}</th>
              <th className="py-2 text-right font-medium">{t('invoices.unitPrice')}</th>
              {withDiscount && <th className="py-2 text-right font-medium">{t('invoices.discount')}</th>}
              <th className="py-2 text-right font-medium">{t('invoices.tax')}</th>
              <th className="py-2 text-right font-medium">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => (
              <tr key={item?.id ?? index} className="border-b last:border-0">
                <td className="py-3">{item?.description ?? ''}</td>
                <td className="py-3 text-right font-mono">{Number(item?.quantity ?? 0)}</td>
                <td className="py-3 text-right font-mono">{money(item?.unitPrice)}</td>
                {withDiscount && (
                  <td className="py-3 text-right font-mono text-red-500">
                    {Number(item?.discount ?? 0) > 0 ? `-${money(item?.discount)}` : ''}
                  </td>
                )}
                <td className="py-3 text-right font-mono">{rateText(item?.taxRate ?? 0, lang)}</td>
                <td className="py-3 text-right font-mono font-medium">{money(lineNetAmount(item).toFixed(2))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <div className="w-full space-y-2 sm:w-72">
          {documentTotalsLines(doc).map((line, index) => {
            if (line.kind === 'total') {
              return (
                <div key={index} className="flex justify-between border-t pt-2 font-medium">
                  <span>{t('common.total')}</span>
                  <span className="font-mono">{money(line.amount)}</span>
                </div>
              );
            }
            const label =
              line.kind === 'subtotal'
                ? t('invoices.subtotal')
                : line.kind === 'discount'
                  ? t('invoices.discount')
                  : line.rate
                    ? `${displayTaxLabel(line.label, lang)} ${rateText(line.rate, lang)}`
                    : t('invoices.tax');
            return (
              <div key={index} className="flex justify-between text-base">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-mono ${line.kind === 'discount' ? 'text-red-500' : ''}`}>
                  {line.kind === 'discount' ? `-${money(line.amount)}` : money(line.amount)}
                </span>
              </div>
            );
          })}
          {children}
        </div>
      </div>
    </>
  );
}

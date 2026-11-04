import type { InvoiceView } from './view-model';

/**
 * Classic — the layout this product has always produced.
 *
 * Company block top-left, INVOICE title top-right, a shaded table header and
 * right-aligned totals. Kept deliberately identical to the previous single
 * template so every existing company's invoices look exactly as they did; it
 * is also the fallback for an unknown template value.
 */
export function renderClassic(v: InvoiceView): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.6; }
  .container { padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .company-name { font-size: 24px; font-weight: 700; color: ${v.brandColor}; }
  .invoice-title { font-size: 28px; font-weight: 700; color: #1a1a2e; text-align: right; }
  .invoice-number { color: #666; font-size: 14px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta-block h3 { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 1px; margin-bottom: 4px; }
  .meta-block p { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background: #f8f7ff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; border-bottom: 2px solid #e5e5e5; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
  .text-right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-table { width: 250px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-row.total { border-top: 2px solid #1a1a2e; padding-top: 8px; margin-top: 4px; font-weight: 700; font-size: 16px; }
  .notes { margin-top: 30px; padding: 16px; background: #f9f9f9; border-radius: 6px; font-size: 12px; color: #666; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; }
</style></head><body>
<div class="container">
  <div class="header">
    ${v.logoSrc ? `<img src="${v.logoSrc}" alt="" style="max-height:56px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block" />` : ''}
    <div class="company-name">${v.companyName}</div>${v.legalName ? `<div style="font-size:12px;color:#666;margin-top:2px">${v.legalName}</div>` : ''}${v.addressLine ? `<div style="font-size:12px;color:#666;margin-top:4px">${v.addressLine}</div>` : ''}${v.countryLine ? `<div style="font-size:12px;color:#666">${v.countryLine}</div>` : ''}${v.contactLine ? `<div style="font-size:11px;color:#888;margin-top:4px">${v.contactLine}</div>` : ''}${v.website ? `<div style="font-size:11px;color:#888">${v.website}</div>` : ''}${v.taxLine ? `<div style="font-size:11px;color:#888;margin-top:2px">${v.taxLine}</div>` : ''}
    <div><div class="invoice-title">${v.labels.invoiceTitle}</div><div class="invoice-number">${v.invoiceNumber}</div></div>
  </div>
  <div class="meta">
    <div class="meta-block"><h3>${v.labels.billTo}</h3><p><strong>${v.customerName}</strong></p>${v.customerCompany ? `<p>${v.customerCompany}</p>` : ''}${v.customerAddressLine ? `<p>${v.customerAddressLine}</p>` : ''}${v.customerEmail ? `<p>${v.customerEmail}</p>` : ''}${v.customerTaxLine ? `<p>${v.customerTaxLine}</p>` : ''}</div>
    <div class="meta-block"><h3>${v.labels.issueDate}</h3><p>${v.issueDate}</p><h3 style="margin-top:8px">${v.labels.dueDate}</h3><p>${v.dueDate}</p></div>
  </div>
  <table>
    <thead><tr><th>${v.labels.description}</th><th class="text-right">${v.labels.qty}</th><th class="text-right">${v.labels.price}</th>${v.showDiscount ? `<th class="text-right">${v.labels.discount}</th>` : ''}<th class="text-right">${v.labels.tax}</th><th class="text-right">${v.labels.amount}</th></tr></thead>
    <tbody>${v.items
      .map(
        (i) =>
          `<tr><td>${i.description}</td><td class="text-right">${i.quantity}</td><td class="text-right">${i.unitPrice}</td>${v.showDiscount ? `<td class="text-right">${i.discount}</td>` : ''}<td class="text-right">${i.taxRate}</td><td class="text-right">${i.amount}</td></tr>`
      )
      .join('')}</tbody>
  </table>
  <div class="totals"><div class="totals-table">
    <div class="totals-row"><span>${v.labels.subtotal}</span><span>${v.subtotal}</span></div>
    ${v.discount ? `<div class="totals-row"><span>${v.labels.discount}</span><span>-${v.discount}</span></div>` : ''}
    ${v.taxLines.map((line) => `<div class="totals-row"><span>${line.label}</span><span>${line.value}</span></div>`).join('')}
    <div class="totals-row total"><span>${v.labels.total}</span><span>${v.total}</span></div>
  </div></div>
  ${v.notes ? `<div class="notes"><strong>${v.labels.notes}:</strong> ${v.notes}</div>` : ''}
  ${v.paymentInstructions ? `<div class="notes"><strong>${v.labels.paymentInstructions}:</strong> ${v.paymentInstructions}</div>` : ''}
  ${v.bankDetails ? `<div class="notes"><strong>${v.labels.bankDetails}:</strong> ${v.bankDetails}</div>` : ''}
  ${v.notice ? `<div class="notes" style="margin-top:20px;font-size:11px">${v.notice}</div>` : ''}
  <div class="footer">${v.footerText}</div>
</div></body></html>`;
}

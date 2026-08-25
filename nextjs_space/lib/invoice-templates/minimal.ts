import type { InvoiceView } from './view-model';

/**
 * Minimal — quiet, typographic, mostly monochrome.
 *
 * Structurally the opposite of Modern: nothing is boxed or filled. The invoice
 * number leads as a single line of large type, the parties are stacked in a
 * plain two-column grid with no borders, the table uses one hairline rule, and
 * the brand colour appears only as a thin accent above the total rather than
 * as a field of colour. Suited to companies that want the document to look like
 * a letter rather than a form.
 */
export function renderMinimal(v: InvoiceView): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111111; font-size: 12.5px; line-height: 1.7; }
  .sheet { padding: 56px 56px 48px; max-width: 760px; }
  .lead { margin-bottom: 40px; }
  .lead .doc { font-size: 32px; font-weight: 300; letter-spacing: -0.5px; }
  .lead .num { font-size: 13px; color: #777777; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .rule { height: 1px; background: #111111; margin: 20px 0 28px; }
  .parties { display: flex; gap: 56px; margin-bottom: 36px; }
  .party { flex: 1; }
  .party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #999999; margin-bottom: 6px; font-weight: 400; }
  .party .name { font-weight: 600; }
  .party p { color: #555555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { padding: 0 0 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #999999; font-weight: 400; border-bottom: 1px solid #dddddd; }
  td { padding: 11px 0; border-bottom: 1px solid #f2f2f2; }
  .text-right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-inner { width: 240px; }
  .row { display: flex; justify-content: space-between; padding: 3px 0; color: #555555; }
  .accent { height: 2px; background: ${v.brandColor}; margin: 10px 0 8px; }
  .row.total { color: #111111; font-weight: 600; font-size: 15px; }
  .note { margin-top: 26px; font-size: 11.5px; color: #666666; }
  .note strong { color: #111111; font-weight: 600; }
  .footer { margin-top: 44px; font-size: 10.5px; color: #aaaaaa; }
</style></head><body>
<div class="sheet">
  <div class="lead">
    ${v.logoSrc ? `<img src="${v.logoSrc}" alt="" style="max-height:40px;max-width:160px;object-fit:contain;margin-bottom:16px;display:block" />` : ''}
    <div class="doc">Invoice</div>
    <div class="num">${v.invoiceNumber}</div>
  </div>
  <div class="rule"></div>
  <div class="parties">
    <div class="party">
      <h3>To</h3>
      <p class="name">${v.customerName}</p>
      ${v.customerCompany ? `<p>${v.customerCompany}</p>` : ''}
      ${v.customerEmail ? `<p>${v.customerEmail}</p>` : ''}
    </div>
    <div class="party">
      <h3>From</h3>
      <p class="name">${v.companyName}</p>
      ${v.legalName ? `<p>${v.legalName}</p>` : ''}
      ${v.addressLine ? `<p>${v.addressLine}</p>` : ''}
      ${v.countryLine ? `<p>${v.countryLine}</p>` : ''}
      ${v.contactLine ? `<p>${v.contactLine}</p>` : ''}
      ${v.website ? `<p>${v.website}</p>` : ''}
      ${v.taxLine ? `<p>${v.taxLine}</p>` : ''}
    </div>
    <div class="party">
      <h3>Issued</h3>
      <p class="name">${v.issueDate}</p>
      <h3 style="margin-top:10px">Due</h3>
      <p class="name">${v.dueDate}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead>
    <tbody>${v.items
      .map(
        (i) =>
          `<tr><td>${i.description}</td><td class="text-right">${i.quantity}</td><td class="text-right">${i.unitPrice}</td><td class="text-right">${i.taxRate}</td><td class="text-right">${i.amount}</td></tr>`
      )
      .join('')}</tbody>
  </table>
  <div class="totals"><div class="totals-inner">
    <div class="row"><span>Subtotal</span><span>${v.subtotal}</span></div>
    ${v.discount ? `<div class="row"><span>Discount</span><span>-${v.discount}</span></div>` : ''}
    ${v.tax ? `<div class="row"><span>Tax</span><span>${v.tax}</span></div>` : ''}
    <div class="accent"></div>
    <div class="row total"><span>Total</span><span>${v.total}</span></div>
  </div></div>
  ${v.notes ? `<div class="note"><strong>Notes:</strong> ${v.notes}</div>` : ''}
  ${v.paymentInstructions ? `<div class="note"><strong>Payment instructions:</strong> ${v.paymentInstructions}</div>` : ''}
  ${v.bankDetails ? `<div class="note"><strong>Bank transfer details:</strong> ${v.bankDetails}</div>` : ''}
  <div class="footer">${v.footerText}</div>
</div></body></html>`;
}

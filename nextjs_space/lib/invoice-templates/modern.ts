import type { InvoiceView } from './view-model';

/**
 * Modern — a branded banner at the top, then cards.
 *
 * The visual hierarchy is genuinely different from Classic rather than a
 * restyle: the brand colour becomes a full-width header band with the invoice
 * number reversed out of it, the parties sit in two bordered cards below, and
 * the total is emphasised in its own tinted panel rather than as the last row
 * of a list. The line-item table drops vertical rules for a lighter grid.
 */
export function renderModern(v: InvoiceView): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; font-size: 13px; line-height: 1.6; }
  .banner { background: ${v.brandColor}; color: #ffffff; padding: 32px 40px; display: flex; justify-content: space-between; align-items: center; }
  .banner .brand { font-size: 22px; font-weight: 700; letter-spacing: -0.2px; }
  .banner .doc { text-align: right; }
  .banner .doc .label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.85; }
  .banner .doc .number { font-size: 22px; font-weight: 700; }
  .container { padding: 32px 40px 40px; }
  .cards { display: flex; gap: 16px; margin-bottom: 28px; }
  .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
  .card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: ${v.brandColor}; margin-bottom: 8px; }
  .card p { font-size: 12px; color: #4b5563; }
  .card p.strong { font-size: 14px; font-weight: 700; color: #111827; }
  .dates { display: flex; gap: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { padding: 10px 0; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid ${v.brandColor}; }
  td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  .text-right { text-align: right; }
  .summary { display: flex; justify-content: flex-end; }
  .summary-box { width: 280px; }
  .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #4b5563; }
  .grand { margin-top: 8px; background: #f5f3ff; border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
  .grand .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #6b7280; }
  .grand .value { font-size: 20px; font-weight: 700; color: ${v.brandColor}; }
  .panel { margin-top: 20px; border-left: 3px solid ${v.brandColor}; padding: 12px 16px; background: #fafafa; font-size: 12px; color: #4b5563; }
  .panel strong { color: #111827; display: block; margin-bottom: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
</style></head><body>
<div class="banner">
  <div>
    ${v.logoSrc ? `<img src="${v.logoSrc}" alt="" style="max-height:44px;max-width:180px;object-fit:contain;margin-bottom:8px;display:block;background:#ffffff;padding:4px;border-radius:4px" />` : ''}
    <div class="brand">${v.companyName}</div>
    ${v.legalName ? `<div style="font-size:11px;opacity:0.85">${v.legalName}</div>` : ''}
  </div>
  <div class="doc">
    <div class="label">Invoice</div>
    <div class="number">${v.invoiceNumber}</div>
  </div>
</div>
<div class="container">
  <div class="cards">
    <div class="card">
      <h3>Billed To</h3>
      <p class="strong">${v.customerName}</p>
      ${v.customerCompany ? `<p>${v.customerCompany}</p>` : ''}
      ${v.customerEmail ? `<p>${v.customerEmail}</p>` : ''}
    </div>
    <div class="card">
      <h3>From</h3>
      <p class="strong">${v.companyName}</p>
      ${v.addressLine ? `<p>${v.addressLine}</p>` : ''}
      ${v.countryLine ? `<p>${v.countryLine}</p>` : ''}
      ${v.contactLine ? `<p>${v.contactLine}</p>` : ''}
      ${v.website ? `<p>${v.website}</p>` : ''}
      ${v.taxLine ? `<p>${v.taxLine}</p>` : ''}
    </div>
    <div class="card">
      <h3>Dates</h3>
      <div class="dates">
        <div><p>Issued</p><p class="strong">${v.issueDate}</p></div>
        <div><p>Due</p><p class="strong">${v.dueDate}</p></div>
      </div>
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
  <div class="summary"><div class="summary-box">
    <div class="summary-row"><span>Subtotal</span><span>${v.subtotal}</span></div>
    ${v.discount ? `<div class="summary-row"><span>Discount</span><span>-${v.discount}</span></div>` : ''}
    ${v.tax ? `<div class="summary-row"><span>Tax</span><span>${v.tax}</span></div>` : ''}
    <div class="grand"><span class="label">Total Due</span><span class="value">${v.total}</span></div>
  </div></div>
  ${v.notes ? `<div class="panel"><strong>Notes</strong>${v.notes}</div>` : ''}
  ${v.paymentInstructions ? `<div class="panel"><strong>Payment instructions</strong>${v.paymentInstructions}</div>` : ''}
  ${v.bankDetails ? `<div class="panel"><strong>Bank transfer details</strong>${v.bankDetails}</div>` : ''}
  <div class="footer">${v.footerText}</div>
</div></body></html>`;
}

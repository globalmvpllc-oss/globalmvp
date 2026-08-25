/**
 * Invoice document template.
 *
 * Extracted from the invoice page so it can be unit-tested: the page is a .tsx
 * module and the test runner cannot parse JSX, so a template that decides
 * whether a logo, a tax row or a footer appears was effectively untestable
 * while it lived there. Nothing about the markup or the arithmetic changed in
 * the move.
 */
import { countryLabel } from '@/lib/countries';

/** Escapes text before interpolation so invoice content cannot inject markup. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateInvoiceHtml(invoice: any, company?: any, logoDataUrl?: string | null): string {
  /**
   * Settings the user can already save but which never reached the document.
   *
   * Each falls back to today's behaviour when unset, so an existing company's
   * invoices look exactly as they did before: logo and tax shown, the footer
   * carrying the company name.
   */
  const showLogo = company?.invoiceShowLogo !== false;
  const showTax = company?.invoiceShowTax !== false;
  const paymentInstructions = company?.paymentInstructions ?? '';
  const bankDetails = company?.bankTransferInstructions ?? '';
  const footerText = company?.invoiceFooter || company?.name || '';
  // Only a literal hex value is interpolated into the stylesheet; anything else
  // falls back to the product default rather than being injected into CSS.
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(company?.primaryColor ?? '')
    ? company.primaryColor
    : '#7C3AED';

  const items = invoice?.items ?? [];
  const currency = invoice?.currency ?? 'USD';
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'TRY' ? '₺' : currency;
  const fmt = (n: number) => `${sym}${(n ?? 0).toFixed(2)}`;
  const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d; } };

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.6; }
  .container { padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .company-name { font-size: 24px; font-weight: 700; color: ${brandColor}; }
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
    ${showLogo && logoDataUrl ? `<img src="${logoDataUrl}" alt="" style="max-height:56px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block" />` : ''}
    <div class="company-name">${esc(company?.name ?? '')}</div>${company?.legalName && company.legalName !== company.name ? `<div style="font-size:12px;color:#666;margin-top:2px">${esc(company.legalName)}</div>` : ''}${company?.address ? `<div style="font-size:12px;color:#666;margin-top:4px">${esc(company.address)}${company?.city ? `, ${esc(company.city)}` : ''}${company?.state ? `, ${esc(company.state)}` : ''}${company?.postalCode ? ` ${esc(company.postalCode)}` : ''}</div>` : ''}${company?.country ? `<div style="font-size:12px;color:#666">${esc(countryLabel(company.country))}</div>` : ''}${(company?.email || company?.phone) ? `<div style="font-size:11px;color:#888;margin-top:4px">${[company?.email, company?.phone].filter(Boolean).map(esc).join(' • ')}</div>` : ''}${company?.website ? `<div style="font-size:11px;color:#888">${esc(company.website)}</div>` : ''}${company?.taxNumber ? `<div style="font-size:11px;color:#888;margin-top:2px">Tax ID: ${esc(company.taxNumber)}${company?.taxOffice ? ` • ${esc(company.taxOffice)}` : ''}</div>` : ''}
    <div><div class="invoice-title">INVOICE</div><div class="invoice-number">${invoice?.invoiceNumber ?? ''}</div></div>
  </div>
  <div class="meta">
    <div class="meta-block"><h3>Bill To</h3><p><strong>${invoice?.customer?.name ?? ''}</strong></p>${invoice?.customer?.companyName ? `<p>${invoice.customer.companyName}</p>` : ''}${invoice?.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}</div>
    <div class="meta-block"><h3>Issue Date</h3><p>${fmtDate(invoice?.issueDate)}</p><h3 style="margin-top:8px">Due Date</h3><p>${fmtDate(invoice?.dueDate)}</p></div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead>
    <tbody>${items.map((i: any) => `<tr><td>${i?.description ?? ''}</td><td class="text-right">${i?.quantity ?? 0}</td><td class="text-right">${fmt(i?.unitPrice ?? 0)}</td><td class="text-right">${i?.taxRate ?? 0}%</td><td class="text-right">${fmt(i?.amount ?? 0)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="totals"><div class="totals-table">
    <div class="totals-row"><span>Subtotal</span><span>${fmt(invoice?.subtotal ?? 0)}</span></div>
    ${(invoice?.discountTotal ?? 0) > 0 ? `<div class="totals-row"><span>Discount</span><span>-${fmt(invoice?.discountTotal ?? 0)}</span></div>` : ''}
    ${showTax && Number(invoice?.taxTotal ?? 0) > 0 ? `<div class="totals-row"><span>Tax</span><span>${fmt(invoice?.taxTotal ?? 0)}</span></div>` : ''}
    <div class="totals-row total"><span>Total</span><span>${fmt(invoice?.total ?? 0)}</span></div>
  </div></div>
  ${invoice?.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(invoice.notes)}</div>` : ''}
  ${paymentInstructions ? `<div class="notes"><strong>Payment instructions:</strong> ${esc(paymentInstructions)}</div>` : ''}
  ${bankDetails ? `<div class="notes"><strong>Bank transfer details:</strong> ${esc(bankDetails)}</div>` : ''}
  <div class="footer">${esc(footerText)}</div>
</div></body></html>`;
}

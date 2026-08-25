/**
 * The data an invoice template draws, prepared once.
 *
 * Templates differ in layout only. Every value here is already escaped,
 * formatted and range-checked, so a template is pure markup and cannot
 * reintroduce an injection by forgetting to call `esc` — which is exactly what
 * the previous single template did for line-item descriptions, the customer
 * name and the invoice number.
 *
 * Financial values are read straight from the invoice and only formatted; no
 * arithmetic happens here, so totals are identical in every template.
 */

import { countryLabel } from '@/lib/countries';

/** Escapes text before interpolation so invoice content cannot inject markup. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The product's default brand colour. */
export const DEFAULT_BRAND_COLOR = '#7C3AED';

/**
 * Brand colours are interpolated into a stylesheet, so only a literal hex value
 * is ever accepted. Anything else — `red`, `expression(...)`, a closing brace
 * followed by new rules — falls back to the default.
 */
export function safeBrandColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_BRAND_COLOR;
}

/**
 * Logos are inlined into `src`. Only a base64 raster data URL is allowed: a
 * value carrying a quote could otherwise close the attribute and open a tag,
 * and SVG can carry script.
 */
export function safeLogoSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

export interface InvoiceItemView {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  amount: string;
}

export interface InvoiceView {
  // Company
  companyName: string;
  legalName: string;
  addressLine: string;
  countryLine: string;
  contactLine: string;
  website: string;
  taxLine: string;

  // Invoice
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  notes: string;

  // Customer
  customerName: string;
  customerCompany: string;
  customerEmail: string;

  items: InvoiceItemView[];

  // Totals, pre-formatted with the invoice's currency symbol.
  subtotal: string;
  discount: string | null;
  tax: string | null;
  total: string;

  // Settings
  logoSrc: string | null;
  brandColor: string;
  footerText: string;
  paymentInstructions: string;
  bankDetails: string;
}

function currencySymbol(currency: string): string {
  switch (currency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'TRY':
      return '₺';
    default:
      return currency;
  }
}

/**
 * Builds the view model.
 *
 * `showLogo` and `showTax` are applied here rather than in each template: a
 * hidden logo becomes a null `logoSrc` and a hidden tax row becomes a null
 * `tax`, so no template can accidentally honour one setting and ignore another.
 */
export function buildInvoiceView(
  invoice: any,
  company?: any,
  logoDataUrl?: string | null
): InvoiceView {
  // Each setting falls back to today's behaviour when unset, so a company that
  // never opened these settings sees no change.
  const showLogo = company?.invoiceShowLogo !== false;
  const showTax = company?.invoiceShowTax !== false;

  const currency = invoice?.currency ?? 'USD';
  const sym = currencySymbol(currency);
  const fmt = (n: unknown) => `${sym}${Number(n ?? 0).toFixed(2)}`;
  const fmtDate = (d: unknown) => {
    if (!d) return '';
    try {
      return new Date(d as string).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(d);
    }
  };

  const addressParts: string[] = [];
  if (company?.address) {
    let line = esc(company.address);
    if (company?.city) line += `, ${esc(company.city)}`;
    if (company?.state) line += `, ${esc(company.state)}`;
    if (company?.postalCode) line += ` ${esc(company.postalCode)}`;
    addressParts.push(line);
  }

  const contact = [company?.email, company?.phone].filter(Boolean).map(esc).join(' • ');

  let taxLine = '';
  if (company?.taxNumber) {
    taxLine = `Tax ID: ${esc(company.taxNumber)}`;
    if (company?.taxOffice) taxLine += ` • ${esc(company.taxOffice)}`;
  }

  const discountValue = Number(invoice?.discountTotal ?? 0);
  const taxValue = Number(invoice?.taxTotal ?? 0);

  return {
    companyName: esc(company?.name ?? ''),
    legalName:
      company?.legalName && company.legalName !== company.name ? esc(company.legalName) : '',
    addressLine: addressParts[0] ?? '',
    countryLine: company?.country ? esc(countryLabel(company.country)) : '',
    contactLine: contact,
    website: company?.website ? esc(company.website) : '',
    taxLine,

    invoiceNumber: esc(invoice?.invoiceNumber ?? ''),
    issueDate: esc(fmtDate(invoice?.issueDate)),
    dueDate: esc(fmtDate(invoice?.dueDate)),
    notes: invoice?.notes ? esc(invoice.notes) : '',

    customerName: esc(invoice?.customer?.name ?? ''),
    customerCompany: invoice?.customer?.companyName ? esc(invoice.customer.companyName) : '',
    customerEmail: invoice?.customer?.email ? esc(invoice.customer.email) : '',

    items: (invoice?.items ?? []).map((i: any) => ({
      description: esc(i?.description ?? ''),
      quantity: esc(i?.quantity ?? 0),
      unitPrice: esc(fmt(i?.unitPrice)),
      taxRate: `${esc(i?.taxRate ?? 0)}%`,
      amount: esc(fmt(i?.amount)),
    })),

    subtotal: esc(fmt(invoice?.subtotal)),
    discount: discountValue > 0 ? esc(fmt(discountValue)) : null,
    tax: showTax && taxValue > 0 ? esc(fmt(taxValue)) : null,
    total: esc(fmt(invoice?.total)),

    logoSrc: showLogo ? safeLogoSrc(logoDataUrl) : null,
    brandColor: safeBrandColor(company?.primaryColor),
    footerText: esc(company?.invoiceFooter || company?.name || ''),
    paymentInstructions: company?.paymentInstructions ? esc(company.paymentInstructions) : '',
    bankDetails: company?.bankTransferInstructions ? esc(company.bankTransferInstructions) : '',
  };
}

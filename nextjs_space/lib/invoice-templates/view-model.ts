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
import { formatCalendarDateLong } from '@/lib/calendar-date';
import { translate, type TranslationKey } from '@/lib/i18n';
import {
  documentLocaleFor,
  showsInformationalNotice,
  isProformaInvoice,
  trTaxIdKind,
  type DocumentLocale,
} from '@/lib/tr-tax';

/** Every fixed word a template prints. Already escaped. */
export interface InvoiceLabels {
  invoiceTitle: string;
  invoice: string;
  billTo: string;
  billedTo: string;
  to: string;
  from: string;
  dates: string;
  issueDate: string;
  dueDate: string;
  issued: string;
  due: string;
  description: string;
  qty: string;
  price: string;
  tax: string;
  amount: string;
  subtotal: string;
  discount: string;
  total: string;
  totalDue: string;
  notes: string;
  paymentInstructions: string;
  bankDetails: string;
}

const LABEL_KEYS: Record<keyof InvoiceLabels, TranslationKey> = {
  invoiceTitle: 'pdf.invoiceTitle',
  invoice: 'pdf.invoice',
  billTo: 'pdf.billTo',
  billedTo: 'pdf.billedTo',
  to: 'pdf.to',
  from: 'pdf.from',
  dates: 'pdf.dates',
  issueDate: 'pdf.issueDate',
  dueDate: 'pdf.dueDate',
  issued: 'pdf.issued',
  due: 'pdf.due',
  description: 'pdf.description',
  qty: 'pdf.qty',
  price: 'pdf.price',
  tax: 'pdf.tax',
  amount: 'pdf.amount',
  subtotal: 'pdf.subtotal',
  discount: 'pdf.discount',
  total: 'pdf.total',
  totalDue: 'pdf.totalDue',
  notes: 'pdf.notes',
  paymentInstructions: 'pdf.paymentInstructions',
  bankDetails: 'pdf.bankDetails',
};

/** The fixed words of an invoice in one language. */
export function invoiceLabels(locale: DocumentLocale): InvoiceLabels {
  const out = {} as InvoiceLabels;
  for (const [field, key] of Object.entries(LABEL_KEYS) as Array<[keyof InvoiceLabels, TranslationKey]>) {
    out[field] = esc(translate(locale, key));
  }
  return out;
}

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
  /** "VKN: … • Vergi dairesi: …" for the customer, or ''. */
  customerTaxLine: string;
  customerAddressLine: string;

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

  // Language
  locale: DocumentLocale;
  labels: InvoiceLabels;
  /** The Turkish "not an official e-document" notice, or ''. */
  notice: string;
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
  // Formatted in UTC terms: a due date must read the same on the invoice
  // wherever the PDF happens to be generated. toLocaleDateString rendered the
  // previous day at negative UTC offsets.
  //
  // The document's language follows the customer (see documentLocaleFor).
  // English keeps the original month format exactly.
  const locale = documentLocaleFor(invoice?.customer, company);
  const labels = invoiceLabels(locale);
  if (isProformaInvoice(invoice, company)) {
    labels.invoiceTitle = esc(translate(locale, 'pdf.proformaTitle'));
    labels.invoice = esc(translate(locale, 'pdf.proforma'));
  }
  const fmtDate = (d: unknown) =>
    locale === 'tr' ? formatCalendarDateLong(d, 'tr-TR') : formatCalendarDateLong(d);
  const word = (key: TranslationKey) => esc(translate(locale, key));

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
    if (locale === 'tr') {
      taxLine = `${word('pdf.taxId')}: ${esc(company.taxNumber)}`;
      if (company?.taxOffice) taxLine += ` • ${word('pdf.taxOffice')}: ${esc(company.taxOffice)}`;
    } else {
      // Unchanged English line, so existing invoices read exactly as before.
      taxLine = `Tax ID: ${esc(company.taxNumber)}`;
      if (company?.taxOffice) taxLine += ` • ${esc(company.taxOffice)}`;
    }
  }

  // The customer's tax number and tax office (vergi dairesi).
  const customer = invoice?.customer ?? {};
  const customerTaxParts: string[] = [];
  if (customer?.taxId) {
    const kind = trTaxIdKind(customer.taxId);
    const label = kind ?? translate(locale, 'pdf.taxId');
    customerTaxParts.push(`${esc(label)}: ${esc(customer.taxId)}`);
  }
  if (customer?.taxOffice) {
    customerTaxParts.push(`${word('pdf.taxOffice')}: ${esc(customer.taxOffice)}`);
  }
  const customerAddress = [customer?.address, customer?.city, customer?.postalCode]
    .filter((part: unknown) => typeof part === 'string' && part.trim() !== '')
    .map(esc)
    .join(', ');

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
    customerTaxLine: customerTaxParts.join(' • '),
    customerAddressLine: customerAddress,

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

    locale,
    labels,
    notice: showsInformationalNotice(invoice, company) ? word('pdf.informationalNotice') : '',
  };
}

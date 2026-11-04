/**
 * Invoice → PDF.
 *
 * `buildInvoicePdfSpec` is pure and holds every business rule for what an
 * invoice shows; `renderInvoicePdf` just hands the spec to the engine. The same
 * fields as the printable HTML: logo, company and tax details, the customer's
 * tax number and tax office, line items, a KDV/VAT breakdown per rate, totals,
 * notes, payment and bank details, and the Turkish "informational" notice.
 *
 * Quotes (Phase 2) reuse `buildCommercialDocumentSpec` with their own title.
 */
import { documentTotalsLines, hasLineDiscount, lineNetAmount, rateText, taxBreakdown } from '@/lib/document-lines';
import { countryLabel } from '@/lib/countries';

/** Country name in the document's language ("Türkiye" / "Turkey"). */
function countryName(code: string, locale: 'tr' | 'en'): string {
  try {
    const name = new Intl.DisplayNames([locale === 'tr' ? 'tr-TR' : 'en-US'], { type: 'region' }).of(code.toUpperCase());
    if (name && name !== code.toUpperCase()) return name;
  } catch {
    // fall through
  }
  return countryLabel(code);
}
import { formatCalendarDateLong } from '@/lib/calendar-date';
import { fillTranslation, translate, type TranslationKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/email/templates';
import {
  displayTaxLabel,
  documentLocaleFor,
  showsInformationalNotice,
  isProformaInvoice,
  trTaxIdKind,
  type DocumentLocale,
} from '@/lib/tr-tax';
import {
  logoFromDataUrl,
  renderBusinessDocumentPdf,
  type AddressedDocumentSpec,
  type DocBlock,
} from './engine';

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const joinLine = (...parts: unknown[]) => parts.filter(nonEmpty).join(', ');

function dateText(value: unknown, locale: DocumentLocale): string {
  return locale === 'tr' ? formatCalendarDateLong(value, 'tr-TR') : formatCalendarDateLong(value);
}

function quantityText(value: unknown, locale: DocumentLocale): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 4 }).format(n);
}

/** Tax per rate; kept exported here for existing callers. */
export { taxBreakdown };

export interface CommercialDocumentOptions {
  /** e.g. 'pdf.invoiceTitle' or (Phase 2) 'pdf.quoteTitle'. */
  titleKey: TranslationKey;
  /** Dates in the top-right block, label keys with their values. */
  dates: Array<{ labelKey: TranslationKey; value: unknown }>;
  /** Show paid / balance due lines (invoices only). */
  showPaid?: boolean;
  /** Print the Turkish "informational" notice (invoices; not quotes). */
  notice?: boolean;
  /**
   * Replaces the company's payment instructions (which talk about due dates
   * and invoice numbers) with this sentence. Quotes use it.
   */
  paymentNoteKey?: TranslationKey;
}

/** Shared by invoices and quotes: anything with a customer, items and totals. */
export function buildCommercialDocumentSpec(
  doc: any,
  company: any,
  options: CommercialDocumentOptions
): AddressedDocumentSpec {
  const locale = documentLocaleFor(doc?.customer, company);
  const t = (key: TranslationKey) => translate(locale, key);
  const currency = doc?.currency ?? 'USD';
  const money = (n: unknown) => formatMoney(n, currency, locale);
  const showTax = company?.invoiceShowTax !== false;
  const showLogo = company?.invoiceShowLogo !== false;

  // Issuer.
  const issuerLines: string[] = [];
  if (nonEmpty(company?.legalName) && company.legalName !== company?.name) issuerLines.push(company.legalName);
  const address = joinLine(company?.address, company?.city, company?.state);
  if (address) issuerLines.push(company?.postalCode ? `${address} ${company.postalCode}` : address);
  if (nonEmpty(company?.country)) issuerLines.push(countryName(company.country, locale));
  const contact = [company?.email, company?.phone].filter(nonEmpty).join(' • ');
  if (contact) issuerLines.push(contact);
  if (nonEmpty(company?.website)) issuerLines.push(company.website);
  if (nonEmpty(company?.taxNumber)) {
    issuerLines.push(
      [`${t('pdf.taxId')}: ${company.taxNumber}`, nonEmpty(company?.taxOffice) ? `${t('pdf.taxOffice')}: ${company.taxOffice}` : '']
        .filter(Boolean)
        .join(' • ')
    );
  }

  // Customer.
  const customer = doc?.customer ?? {};
  const partyLines: string[] = [];
  if (nonEmpty(customer.companyName)) partyLines.push(customer.companyName);
  const customerAddress = joinLine(customer.address, customer.city, customer.postalCode);
  if (customerAddress) partyLines.push(customerAddress);
  if (nonEmpty(customer.country)) partyLines.push(countryName(customer.country, locale));
  if (nonEmpty(customer.email)) partyLines.push(customer.email);
  const taxParts: string[] = [];
  if (nonEmpty(customer.taxId)) taxParts.push(`${trTaxIdKind(customer.taxId) ?? t('pdf.taxId')}: ${customer.taxId}`);
  if (nonEmpty(customer.taxOffice)) taxParts.push(`${t('pdf.taxOffice')}: ${customer.taxOffice}`);
  if (taxParts.length) partyLines.push(taxParts.join(' • '));

  // Line items. "Amount" is the line before VAT, after its discount; the
  // discount column appears only when some line has one.
  const items: any[] = doc?.items ?? [];
  const withDiscount = hasLineDiscount(items);
  const columns = withDiscount
    ? [
        { label: t('pdf.description'), width: 38 },
        { label: t('pdf.qty'), width: 9, align: 'right' as const },
        { label: t('pdf.price'), width: 15, align: 'right' as const },
        { label: t('pdf.discount'), width: 13, align: 'right' as const },
        { label: t('pdf.tax'), width: 9, align: 'right' as const },
        { label: t('pdf.amount'), width: 16, align: 'right' as const },
      ]
    : [
        { label: t('pdf.description'), width: 46 },
        { label: t('pdf.qty'), width: 10, align: 'right' as const },
        { label: t('pdf.price'), width: 16, align: 'right' as const },
        { label: t('pdf.tax'), width: 10, align: 'right' as const },
        { label: t('pdf.amount'), width: 18, align: 'right' as const },
      ];
  const blocks: DocBlock[] = [
    {
      kind: 'table',
      columns,
      rows: items.map((item) => ({
        cells: [
          String(item?.description ?? ''),
          quantityText(item?.quantity, locale),
          money(item?.unitPrice),
          ...(withDiscount ? [Number(item?.discount ?? 0) > 0 ? `-${money(item?.discount)}` : ''] : []),
          rateText(item?.taxRate ?? 0, locale),
          money(lineNetAmount(item).toFixed(2)),
        ],
      })),
    },
  ];

  // Totals: subtotal, discount, VAT per rate, grand total.
  const lines: Array<{ label: string; value: string; strong?: boolean }> = documentTotalsLines(doc, { showTax }).map(
    (line) => {
      switch (line.kind) {
        case 'subtotal':
          return { label: t('pdf.subtotal'), value: money(line.amount) };
        case 'discount':
          return { label: t('pdf.discount'), value: `-${money(line.amount)}` };
        case 'tax': {
          const label = line.rate ? displayTaxLabel(line.label, locale) : t('pdf.tax');
          return { label: line.rate ? `${label} ${rateText(line.rate, locale)}` : label, value: money(line.amount) };
        }
        case 'total':
          return { label: t('pdf.total'), value: money(line.amount), strong: true };
      }
    }
  );
  const paid = Number(doc?.amountPaid ?? 0);
  if (options.showPaid && paid > 0) {
    lines.push({ label: t('pdf.paid'), value: money(paid) });
    lines.push({ label: t('pdf.balanceDue'), value: money(Number(doc?.total ?? 0) - paid) });
  }
  blocks.push({ kind: 'totals', lines });

  if (nonEmpty(doc?.notes)) blocks.push({ kind: 'text', title: t('pdf.notes'), body: doc.notes });
  if (options.paymentNoteKey) {
    blocks.push({ kind: 'text', title: t('pdf.paymentInstructions'), body: t(options.paymentNoteKey) });
  } else if (nonEmpty(company?.paymentInstructions)) {
    blocks.push({ kind: 'text', title: t('pdf.paymentInstructions'), body: company.paymentInstructions });
  }
  if (nonEmpty(company?.bankTransferInstructions)) {
    blocks.push({ kind: 'text', title: t('pdf.bankDetails'), body: company.bankTransferInstructions });
  }
  if (options.notice !== false && showsInformationalNotice(doc, company)) {
    blocks.push({ kind: 'text', body: t('pdf.informationalNotice'), boxed: true, small: true });
  }

  return {
    title: t(options.titleKey),
    number: String(doc?.invoiceNumber ?? doc?.quoteNumber ?? ''),
    brandColor: company?.primaryColor,
    logo: showLogo ? logoFromDataUrl(company?.logoUrl) : null,
    issuer: { name: String(company?.name ?? ''), lines: issuerLines },
    party: { heading: t('pdf.billTo'), name: String(customer.name ?? ''), lines: partyLines },
    meta: options.dates
      .filter((d) => d.value)
      .map((d) => ({ label: t(d.labelKey), value: dateText(d.value, locale) })),
    blocks,
    footer: String(company?.invoiceFooter || company?.name || ''),
    pageLabel: fillTranslation(locale, 'pdf.page', { page: '{page}', total: '{total}' }),
    metadata: {
      title: `${t(options.titleKey)} ${doc?.invoiceNumber ?? doc?.quoteNumber ?? ''}`.trim(),
      author: String(company?.name ?? ''),
      language: locale === 'tr' ? 'tr-TR' : 'en-US',
    },
  };
}

export function buildInvoicePdfSpec(invoice: any, company: any): AddressedDocumentSpec {
  return buildCommercialDocumentSpec(invoice, company, {
    titleKey: isProformaInvoice(invoice, company) ? 'pdf.proformaTitle' : 'pdf.invoiceTitle',
    dates: [
      { labelKey: 'pdf.issueDate', value: invoice?.issueDate },
      { labelKey: 'pdf.dueDate', value: invoice?.dueDate },
    ],
    showPaid: true,
  });
}

/** The invoice as PDF bytes. `invoice` must include `items` and `customer`. */
export function renderInvoicePdf(invoice: any, company: any, createdAt?: Date): Promise<Uint8Array> {
  return renderBusinessDocumentPdf({ ...buildInvoicePdfSpec(invoice, company), createdAt });
}

export function buildQuotePdfSpec(quote: any, company: any): AddressedDocumentSpec {
  return buildCommercialDocumentSpec(quote, company, {
    titleKey: 'pdf.quoteTitle',
    dates: [
      { labelKey: 'pdf.quoteDate', value: quote?.issueDate },
      { labelKey: 'pdf.validUntil', value: quote?.validUntil },
    ],
    showPaid: false,
    notice: false,
    paymentNoteKey: 'pdf.quoteContact',
  });
}

/** The quote as PDF bytes. `quote` must include `items` and `customer`. */
export function renderQuotePdf(quote: any, company: any, createdAt?: Date): Promise<Uint8Array> {
  return renderBusinessDocumentPdf({ ...buildQuotePdfSpec(quote, company), createdAt });
}

/** A file name that is safe on every OS. */
export function invoicePdfFileName(invoiceNumber: unknown): string {
  const base = String(invoiceNumber ?? 'invoice').replace(/[^\w.-]+/g, '_') || 'invoice';
  return `${base}.pdf`;
}

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
import Decimal from 'decimal.js';
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
  trTaxIdKind,
  type DocumentLocale,
} from '@/lib/tr-tax';
import {
  logoFromDataUrl,
  renderBusinessDocumentPdf,
  type BusinessDocumentSpec,
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

function rateText(rate: Decimal, locale: DocumentLocale): string {
  const n = rate.toNumber();
  const shown = Number.isInteger(n) ? String(n) : rate.toDecimalPlaces(2).toString();
  return locale === 'tr' ? `%${shown}` : `${shown}%`;
}

/**
 * Tax per rate, from the line items with the same formula the invoice total
 * uses (lib/invoice-calc): (qty × price − discount) × rate / 100. Zero-rate
 * lines are left out; the rows are ordered by rate.
 */
export function taxBreakdown(items: any[]): Array<{ rate: Decimal; base: Decimal; tax: Decimal; label: string }> {
  const byRate = new Map<string, { rate: Decimal; base: Decimal; tax: Decimal; label: string }>();
  for (const item of items ?? []) {
    const rate = new Decimal(String(item?.taxRate ?? 0));
    if (rate.lte(0)) continue;
    const base = Decimal.max(
      new Decimal(String(item?.quantity ?? 0)).mul(new Decimal(String(item?.unitPrice ?? 0))).minus(new Decimal(String(item?.discount ?? 0))),
      0
    );
    const key = rate.toString();
    const entry = byRate.get(key) ?? { rate, base: new Decimal(0), tax: new Decimal(0), label: String(item?.taxLabel ?? '') };
    entry.base = entry.base.plus(base);
    entry.tax = entry.tax.plus(base.mul(rate).div(100));
    byRate.set(key, entry);
  }
  return [...byRate.values()].sort((a, b) => b.rate.comparedTo(a.rate));
}

export interface CommercialDocumentOptions {
  /** e.g. 'pdf.invoiceTitle' or (Phase 2) 'pdf.quoteTitle'. */
  titleKey: TranslationKey;
  /** Dates in the top-right block, label keys with their values. */
  dates: Array<{ labelKey: TranslationKey; value: unknown }>;
  /** Show paid / balance due lines (invoices only). */
  showPaid?: boolean;
}

/** Shared by invoices and quotes: anything with a customer, items and totals. */
export function buildCommercialDocumentSpec(
  doc: any,
  company: any,
  options: CommercialDocumentOptions
): BusinessDocumentSpec {
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

  // Line items.
  const items: any[] = doc?.items ?? [];
  const blocks: DocBlock[] = [
    {
      kind: 'table',
      columns: [
        { label: t('pdf.description'), width: 46 },
        { label: t('pdf.qty'), width: 10, align: 'right' },
        { label: t('pdf.price'), width: 16, align: 'right' },
        { label: t('pdf.tax'), width: 10, align: 'right' },
        { label: t('pdf.amount'), width: 18, align: 'right' },
      ],
      rows: items.map((item) => ({
        cells: [
          String(item?.description ?? ''),
          quantityText(item?.quantity, locale),
          money(item?.unitPrice),
          rateText(new Decimal(String(item?.taxRate ?? 0)), locale),
          money(item?.amount),
        ],
      })),
    },
  ];

  // Totals with the tax broken down per rate.
  const lines: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: t('pdf.subtotal'), value: money(doc?.subtotal) },
  ];
  const discount = Number(doc?.discountTotal ?? 0);
  if (discount > 0) lines.push({ label: t('pdf.discount'), value: `-${money(discount)}` });
  const taxTotal = Number(doc?.taxTotal ?? 0);
  if (showTax && taxTotal > 0) {
    const breakdown = taxBreakdown(items);
    if (breakdown.length <= 1) {
      const only = breakdown[0];
      const label = only ? displayTaxLabel(only.label, locale) : t('pdf.tax');
      lines.push({
        label: only ? `${label} ${rateText(only.rate, locale)}` : label,
        value: money(taxTotal),
      });
    } else {
      for (const row of breakdown) {
        lines.push({
          label: `${displayTaxLabel(row.label, locale)} ${rateText(row.rate, locale)}`,
          value: money(row.tax.toDecimalPlaces(2)),
        });
      }
    }
  }
  lines.push({ label: t('pdf.total'), value: money(doc?.total), strong: true });
  const paid = Number(doc?.amountPaid ?? 0);
  if (options.showPaid && paid > 0) {
    lines.push({ label: t('pdf.paid'), value: money(paid) });
    lines.push({ label: t('pdf.balanceDue'), value: money(Number(doc?.total ?? 0) - paid) });
  }
  blocks.push({ kind: 'totals', lines });

  if (nonEmpty(doc?.notes)) blocks.push({ kind: 'text', title: t('pdf.notes'), body: doc.notes });
  if (nonEmpty(company?.paymentInstructions)) {
    blocks.push({ kind: 'text', title: t('pdf.paymentInstructions'), body: company.paymentInstructions });
  }
  if (nonEmpty(company?.bankTransferInstructions)) {
    blocks.push({ kind: 'text', title: t('pdf.bankDetails'), body: company.bankTransferInstructions });
  }
  if (showsInformationalNotice(doc, company)) {
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

export function buildInvoicePdfSpec(invoice: any, company: any): BusinessDocumentSpec {
  return buildCommercialDocumentSpec(invoice, company, {
    titleKey: 'pdf.invoiceTitle',
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

/** A file name that is safe on every OS. */
export function invoicePdfFileName(invoiceNumber: unknown): string {
  const base = String(invoiceNumber ?? 'invoice').replace(/[^\w.-]+/g, '_') || 'invoice';
  return `${base}.pdf`;
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  canConvertQuote,
  canEditQuote,
  canTransitionQuote,
  defaultQuotePrefix,
  QUOTE_STATUSES,
  quoteStatusBadge,
} from '@/lib/quote-status';
import { afterRun, dueDateFor, isRecurringDue, nextRunDate } from '@/lib/recurring';
import { buildVatReport, expenseVat, vatFromGross, vatPeriod } from '@/lib/vat-report';
import { resolveExpenseTax } from '@/lib/expense-tax';
import { buildCsv, buildXlsx, csvSafe } from '@/lib/export/tabular';
import { computeLineItems, itemsFromRows } from '@/lib/line-items';
import { buildQuotePdfSpec, renderQuotePdf, buildInvoicePdfSpec } from '@/lib/pdf/invoice-pdf';
import { invoiceEmail, paymentReminderEmail, quoteEmail } from '@/lib/email/templates';
import { renderInvoiceHtml } from '@/lib/invoice-templates';
import { isProformaInvoice } from '@/lib/tr-tax';
import { quoteCreateSchema, recurringCreateSchema, expenseSchema } from '@/lib/validation';
import { CAPABILITIES } from '@/lib/billing/features';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
describe('proforma title (Turkish companies until e-document)', () => {
  const tr = { country: 'TR', name: 'Örnek' };
  it('applies to Turkish companies only, and not once an e-document exists', () => {
    expect(isProformaInvoice({}, tr)).toBe(true);
    expect(isProformaInvoice({ eDocumentUuid: 'x' }, tr)).toBe(false);
    expect(isProformaInvoice({}, { country: 'US' })).toBe(false);
  });

  it('PDF, print view and emails all say proforma', () => {
    const invoice = { invoiceNumber: 'F-1', currency: 'TRY', total: 10, customer: { name: 'A', country: 'TR' }, items: [] };
    expect(buildInvoicePdfSpec(invoice, tr).title).toBe('PROFORMA FATURA');
    expect(buildInvoicePdfSpec({ ...invoice, customer: { name: 'B' } }, { country: 'US', name: 'Acme' }).title).toBe('INVOICE');
    expect(renderInvoiceHtml(invoice, tr)).toContain('PROFORMA FATURA');
    expect(renderInvoiceHtml({ ...invoice, customer: { name: 'B' } }, { country: 'US' })).toContain('>INVOICE<');

    const base = { locale: 'tr' as const, companyName: 'Örnek', customerName: 'A', invoiceNumber: 'F-1', amountDue: 10, currency: 'TRY', dueDate: '2026-12-01' };
    const mail = invoiceEmail({ ...base, proforma: true });
    expect(mail.subject).toBe('Örnek - F-1 numaralı proforma fatura');
    expect(mail.text).toContain('proforma faturanız ektedir');
    expect(invoiceEmail({ ...base, locale: 'en', proforma: true }).subject).toBe('Proforma invoice F-1 from Örnek');
    expect(paymentReminderEmail({ ...base, kind: 'overdue', proforma: true }).subject).toContain('proforma fatura');
    expect(invoiceEmail(base).subject).toBe('Örnek - F-1 numaralı fatura');
  });

  it('every sender passes the proforma flag', () => {
    expect(src('app/api/invoices/[id]/send/route.ts')).toContain('proforma: isProformaInvoice(');
    expect(src('lib/cron/jobs.ts').match(/proforma: isProformaInvoice\(/g)?.length).toBe(2);
    expect(src('app/(app)/invoices/[id]/page.tsx')).toContain("t('invoices.proformaLabel')");
  });
});

// ---------------------------------------------------------------------------
describe('quote lifecycle', () => {
  it('has the five statuses', () => {
    expect([...QUOTE_STATUSES]).toEqual(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
    for (const s of QUOTE_STATUSES) expect(quoteStatusBadge(s).labelKey.startsWith('quotes.status.')).toBe(true);
  });

  it('moves forward only', () => {
    expect(canTransitionQuote('DRAFT', 'SENT')).toBe(true);
    expect(canTransitionQuote('SENT', 'ACCEPTED')).toBe(true);
    expect(canTransitionQuote('SENT', 'REJECTED')).toBe(true);
    expect(canTransitionQuote('EXPIRED', 'ACCEPTED')).toBe(true);
    expect(canTransitionQuote('DRAFT', 'ACCEPTED')).toBe(false);
    expect(canTransitionQuote('ACCEPTED', 'REJECTED')).toBe(false);
    expect(canTransitionQuote('REJECTED', 'SENT')).toBe(false);
  });

  it('converts once, never when rejected', () => {
    expect(canConvertQuote({ status: 'SENT' })).toBe(true);
    expect(canConvertQuote({ status: 'EXPIRED' })).toBe(true);
    expect(canConvertQuote({ status: 'REJECTED' })).toBe(false);
    expect(canConvertQuote({ status: 'ACCEPTED', convertedInvoiceId: 'inv' })).toBe(false);
  });

  it('edits only drafts', () => {
    expect(canEditQuote({ status: 'DRAFT' })).toBe(true);
    expect(canEditQuote({ status: 'SENT' })).toBe(false);
  });

  it('numbers TKL- for Turkey, QUO- elsewhere', () => {
    expect(defaultQuotePrefix('TR')).toBe('TKL-');
    expect(defaultQuotePrefix('US')).toBe('QUO-');
  });

  it('the schema needs a customer, a valid-until date and items', () => {
    expect(quoteCreateSchema.safeParse({ customerId: 'c', validUntil: '2026-12-01', items: [] }).success).toBe(false);
    expect(
      quoteCreateSchema.safeParse({
        customerId: 'c',
        validUntil: '2026-12-01',
        items: [{ description: 'x', quantity: 1, unitPrice: 10, taxRate: 20 }],
      }).success
    ).toBe(true);
  });

  it('items survive the trip quote → invoice unchanged', () => {
    const input = [
      { description: 'Danışmanlık', quantity: 2, unitPrice: 1500, discount: 100, taxRate: 20, taxLabel: 'KDV' },
      { description: 'Kitap', quantity: 1, unitPrice: 80, discount: 0, taxRate: 10, taxLabel: 'KDV' },
    ];
    const asQuote = computeLineItems(input);
    const asInvoice = computeLineItems(itemsFromRows(asQuote.rows));
    expect(asInvoice.rows).toEqual(asQuote.rows);
    expect(asInvoice.totals).toEqual(asQuote.totals);
    expect(asQuote.totals.total).toBe(3568); // 2900 × 1.2 + 80 × 1.1
  });

  it('the convert route is company-scoped, single-use and counts the invoice', () => {
    const route = src('app/api/quotes/[id]/convert/route.ts');
    expect(route).toContain('where: { id: params.id, companyId }');
    // Single use: compare-and-set on the convertedAt read, plus the unique convertedInvoiceId below.
    expect(route).toContain('convertedInvoiceId: null, convertedAt: quote.convertedAt');
    expect(route).toContain("enforcePlanLimit(companyId, 'invoicesPerMonth')");
    expect(route).toContain("status: 'DRAFT'");
    expect(src('prisma/schema.prisma')).toMatch(/convertedInvoiceId String\?\s+@unique/);
  });

  it('every quote route is scoped to the session company', () => {
    for (const file of ['app/api/quotes/[id]/route.ts', 'app/api/quotes/[id]/pdf/route.ts', 'app/api/quotes/[id]/send/route.ts']) {
      expect(src(file), file).toContain('where: { id: params.id, companyId }');
    }
    expect(src('app/api/quotes/route.ts')).toContain('where: { id: data.customerId, companyId }');
    expect(src('app/api/quotes/[id]/pdf/route.ts')).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
  });

  it('expires sent quotes nightly', () => {
    const jobs = src('lib/cron/jobs.ts');
    expect(jobs).toContain("where: { status: 'SENT', validUntil: { lt: startOfUtcDay(now) }, convertedInvoiceId: null }");
    expect(src('app/api/cron/daily/route.ts')).toContain('expireQuotes(now)');
  });
});

describe('quote PDF and email', () => {
  const quote = {
    quoteNumber: 'TKL-0001',
    issueDate: '2026-11-05',
    validUntil: '2026-12-05',
    currency: 'TRY',
    subtotal: 100,
    taxTotal: 20,
    total: 120,
    customer: { name: 'Ayşe', country: 'TR' },
    items: [{ description: 'Hizmet', quantity: 1, unitPrice: 100, taxRate: 20, amount: 120 }],
  };
  it('is titled TEKLİF, shows validity and no invoice notice', () => {
    const spec = buildQuotePdfSpec(quote, { country: 'TR', name: 'Örnek' });
    expect(spec.title).toBe('TEKLİF');
    expect(spec.number).toBe('TKL-0001');
    expect(spec.meta.map((m) => m.label)).toEqual(['Teklif tarihi', 'Geçerlilik tarihi']);
    expect(JSON.stringify(spec)).not.toContain('e-Arşiv');
  });
  it('renders with the pdf-lib engine', async () => {
    const doc = await PDFDocument.load(await renderQuotePdf(quote, { country: 'TR', name: 'Örnek' }));
    expect(doc.getTitle()).toBe('TEKLİF TKL-0001');
  });
  it('email in Turkish', () => {
    const mail = quoteEmail({ locale: 'tr', companyName: 'Örnek', customerName: 'Ayşe', quoteNumber: 'TKL-0001', total: 120, currency: 'TRY', validUntil: '2026-12-05' });
    expect(mail.subject).toBe('Örnek - TKL-0001 numaralı teklif');
    expect(mail.text).toContain('5 Aralık 2026');
  });
});

// ---------------------------------------------------------------------------
describe('recurring invoice dates', () => {
  it('monthly keeps the day, clamping at month end', () => {
    expect(iso(nextRunDate(utc('2026-01-31'), 'MONTHLY', 31))).toBe('2026-02-28');
    expect(iso(nextRunDate(utc('2026-02-28'), 'MONTHLY', 31))).toBe('2026-03-31');
    expect(iso(nextRunDate(utc('2028-01-31'), 'MONTHLY', 31))).toBe('2028-02-29');
    expect(iso(nextRunDate(utc('2026-12-15'), 'MONTHLY', 15))).toBe('2027-01-15');
  });
  it('quarterly and yearly', () => {
    expect(iso(nextRunDate(utc('2026-11-30'), 'QUARTERLY', 30))).toBe('2027-02-28');
    expect(iso(nextRunDate(utc('2028-02-29'), 'YEARLY', 29))).toBe('2029-02-28');
  });
  it('is due on and after its date, while active and before its end', () => {
    const now = new Date('2026-11-05T04:00:00Z');
    expect(isRecurringDue({ isActive: true, nextRunDate: utc('2026-11-05') }, now)).toBe(true);
    expect(isRecurringDue({ isActive: true, nextRunDate: utc('2026-11-06') }, now)).toBe(false);
    expect(isRecurringDue({ isActive: false, nextRunDate: utc('2026-11-01') }, now)).toBe(false);
    expect(isRecurringDue({ isActive: true, nextRunDate: utc('2026-11-01'), endDate: utc('2026-10-31') }, now)).toBe(false);
  });
  it('stops after the last period', () => {
    const run = afterRun({ nextRunDate: utc('2026-11-05'), frequency: 'MONTHLY', dayOfMonth: 5, endDate: utc('2026-11-30') });
    expect(iso(run.nextRunDate)).toBe('2026-12-05');
    expect(run.isActive).toBe(false);
  });
  it('due date = issue date + terms', () => {
    expect(iso(dueDateFor(utc('2026-11-05'), 30))).toBe('2026-12-05');
  });
  it('auto-send is off by default', () => {
    const parsed = recurringCreateSchema.parse({
      customerId: 'c',
      frequency: 'MONTHLY',
      startDate: '2026-11-05',
      items: [{ description: 'Kira', quantity: 1, unitPrice: 1000 }],
    });
    expect(parsed.autoSend).toBe(false);
    expect(src('prisma/schema.prisma')).toMatch(/autoSend\s+Boolean\s+@default\(false\)/);
  });
  it('the cron claims each period once, creates a DRAFT and respects the plan limit', () => {
    const jobs = src('lib/cron/jobs.ts');
    expect(jobs).toContain('where: { id: template.id, isActive: true, nextRunDate: template.nextRunDate }');
    expect(jobs).toContain("checkPlanLimit(template.companyId, 'invoicesPerMonth')");
    expect(jobs).toContain('recurringInvoiceId: template.id');
    expect(jobs).toContain("where: { id: invoice.id, status: 'DRAFT' }");
    expect(src('app/api/cron/daily/route.ts')).toContain('generateRecurringInvoices(now)');
  });
  it('template routes are company-scoped', () => {
    const route = src('app/api/recurring-invoices/[id]/route.ts');
    expect(route.match(/where: \{ id: params\.id, companyId \}/g)?.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('VAT report', () => {
  const report = buildVatReport({
    invoices: [
      { currency: 'TRY', items: [
        { quantity: 1, unitPrice: 1000, discount: 0, taxRate: 20 },
        { quantity: 2, unitPrice: 50, discount: 0, taxRate: 10 },
        { quantity: 1, unitPrice: 30, discount: 0, taxRate: 1 },
        { quantity: 1, unitPrice: 5, discount: 0, taxRate: 0 },
      ] },
      { currency: 'TRY', items: [{ quantity: 1, unitPrice: 500, discount: 100, taxRate: 20 }] },
      { currency: 'EUR', items: [{ quantity: 1, unitPrice: 100, discount: 0, taxRate: 20 }] },
    ],
    expenses: [
      { currency: 'TRY', amount: 120, taxRate: 20, taxAmount: 20 },
      { currency: 'TRY', amount: 110, taxRate: 10, taxAmount: null },
      { currency: 'TRY', amount: 50, taxRate: null, taxAmount: 5 },
    ],
  });
  const tr = report.find((r) => r.currency === 'TRY')!;

  it('separates currencies', () => {
    expect(report.map((r) => r.currency)).toEqual(['EUR', 'TRY']);
  });
  it('output VAT per rate, highest first', () => {
    expect(tr.output).toEqual([
      { rate: '20', base: '1400.00', tax: '280.00', count: 2 },
      { rate: '10', base: '100.00', tax: '10.00', count: 1 },
      { rate: '1', base: '30.00', tax: '0.30', count: 1 },
      { rate: '0', base: '5.00', tax: '0.00', count: 1 },
    ]);
    expect(tr.outputTax).toBe('290.30');
  });
  it('input VAT from stored amounts, derived rates and rate-less entries', () => {
    expect(tr.input).toEqual([
      { rate: '20', base: '100.00', tax: '20.00', count: 1 },
      { rate: '10', base: '100.00', tax: '10.00', count: 1 },
      { rate: '?', base: '45.00', tax: '5.00', count: 1 },
    ]);
    expect(tr.inputTax).toBe('35.00');
    expect(tr.net).toBe('255.30');
  });
  it('VAT inside a gross amount', () => {
    expect(vatFromGross(118, 18).toFixed(2)).toBe('18.00');
    expect(vatFromGross(100, 0).toFixed(2)).toBe('0.00');
    expect(expenseVat({ currency: 'TRY', amount: 10, taxAmount: 50 })?.toFixed(2)).toBe('10.00');
    expect(expenseVat({ currency: 'TRY', amount: 10 })).toBeNull();
  });
  it('periods are inclusive and default to this month', () => {
    const p = vatPeriod('2026-11-01', '2026-11-30')!;
    expect(p.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(p.lt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(vatPeriod(null, null, new Date('2026-02-10T12:00:00Z'))).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(vatPeriod('nope', null)).toBeNull();
    expect(vatPeriod('2026-11-30', '2026-11-01')).toBeNull();
  });
  it('counts issued invoices only, by issue date', () => {
    const data = src('lib/vat-report-data.ts');
    expect(data).toContain('status: { in: [...ISSUED_INVOICE_STATUSES] }');
    expect(data).toContain('issueDate: { gte: period.gte, lt: period.lt }');
    expect(data.match(/companyId,/g)?.length).toBe(2);
  });
});

describe('expense VAT', () => {
  it('derives from the rate, keeps a given amount, refuses more VAT than amount', () => {
    expect(resolveExpenseTax(120, 20, undefined)).toEqual({ ok: true, taxRate: 20, taxAmount: 20 });
    expect(resolveExpenseTax(120, 20, 19.5)).toEqual({ ok: true, taxRate: 20, taxAmount: 19.5 });
    expect(resolveExpenseTax(120, null, null)).toEqual({ ok: true, taxRate: null, taxAmount: null });
    expect(resolveExpenseTax(10, null, 50).ok).toBe(false);
  });
  it('is optional on the expense schema', () => {
    expect(expenseSchema.safeParse({ description: 'x', amount: 10 }).success).toBe(true);
    expect(expenseSchema.safeParse({ description: 'x', amount: 10, taxRate: 20, taxAmount: 1.67 }).success).toBe(true);
    expect(expenseSchema.safeParse({ description: 'x', amount: 10, taxRate: 120 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Excel and CSV', () => {
  const table = {
    name: 'Faturalar',
    columns: [
      { header: 'Numara' },
      { header: 'Tarih', type: 'date' as const },
      { header: 'Tutar', type: 'money' as const },
      { header: 'Not' },
    ],
    rows: [
      ['F-1', '2026-11-05', 1234.5, 'Şeftali; "özel"'],
      ['F-2', new Date('2026-11-06T00:00:00Z'), '99.9', '=HYPERLINK("x")'],
    ],
  };

  it('xlsx is a zip with the workbook parts, Turkish text intact, numbers as numbers', () => {
    const bytes = buildXlsx([table]);
    expect(bytes[0]).toBe(0x50); // PK
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(text).toContain(part);
    }
    expect(text).toContain('<sheet name="Faturalar"');
    expect(text).toContain('Şeftali; &quot;özel&quot;');
    expect(text).toContain('<c r="C2" s="3"><v>1234.5</v></c>');
    // A formula-looking value stays text in xlsx.
    expect(text).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    // 2026-11-05 as an Excel date serial.
    expect(text).toContain('<c r="B2" s="2"><v>46331</v></c>');
  });

  it('Turkish CSV: BOM, semicolons, decimal comma, quoting, no formulas', () => {
    const csv = buildCsv(table, 'tr');
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Numara;Tarih;Tutar;Not');
    expect(lines[1]).toBe('F-1;2026-11-05;1234,50;"Şeftali; ""özel"""');
    expect(lines[2]).toBe(`F-2;2026-11-06;99,90;"'=HYPERLINK(""x"")"`);
  });

  it('English CSV uses commas and a decimal point', () => {
    expect(buildCsv(table, 'en').split('\r\n')[1]).toBe('F-1,2026-11-05,1234.50,"Şeftali; ""özel"""');
  });

  it('neutralises spreadsheet formulas', () => {
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(csvSafe(bad).startsWith("'")).toBe(true);
    expect(csvSafe('Normal')).toBe('Normal');
  });

  it('the export route is company-scoped and plan-gated on the server', () => {
    const route = src('app/api/export/[dataset]/route.ts');
    expect(route).toContain('requireUserCompany()');
    expect(route).toContain("CAPABILITIES.find((c) => c.id === 'dataExport')");
    expect(route).toContain("code: 'FEATURE_NOT_IN_PLAN'");
    expect(route).toContain('status: 402');
    const datasets = src('lib/export/datasets.ts');
    // Every query in the loaders filters by the session company.
    expect(datasets.match(/findMany\(\{\s*where: \{ companyId/g)?.length).toBe(6);
  });

  it('data export now shows as available', () => {
    expect(CAPABILITIES.find((c) => c.id === 'dataExport')?.status).toBe('available');
  });

  it('export buttons on every list and on the VAT report', () => {
    for (const [file, dataset] of [
      ['app/(app)/invoices/page.tsx', 'invoices'],
      ['app/(app)/customers/page.tsx', 'customers'],
      ['app/(app)/income/page.tsx', 'income'],
      ['app/(app)/expenses/page.tsx', 'expenses'],
      ['app/(app)/payments/page.tsx', 'payments'],
      ['app/(app)/quotes/page.tsx', 'quotes'],
      ['app/(app)/reports/vat/page.tsx', 'vat'],
    ]) {
      expect(src(file), file).toContain(`<ExportMenu dataset="${dataset}"`);
    }
  });
});

describe('navigation and safety', () => {
  it('quotes and recurring invoices are in the menu', () => {
    const sidebar = src('components/app-sidebar.tsx');
    expect(sidebar).toContain("href: '/quotes'");
    expect(sidebar).toContain("href: '/recurring'");
  });
  it('a customer with quotes or templates is not deleted (they would cascade)', () => {
    expect(src('app/api/customers/[id]/route.ts')).toContain("code: 'HAS_QUOTES_OR_RECURRING'");
  });
  it('the migration only adds', () => {
    const sql = src('prisma/migrations/20261105120000_tr_readiness_phase2/migration.sql')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER COLUMN/i);
  });
});

// ---------------------------------------------------------------------------
import { applyCompanyTaxLabel, companyCurrency } from '@/lib/line-items';

describe('Turkish defaults for quotes and recurring invoices', () => {
  it('the new tables default to TRY and KDV', () => {
    const sql = src('prisma/migrations/20261105120000_tr_readiness_phase2/migration.sql');
    for (const table of ['Quote', 'RecurringInvoice']) {
      const body = sql.split(`CREATE TABLE "${table}" (`)[1].split(');')[0];
      expect(body, table).toContain(`"currency" TEXT NOT NULL DEFAULT 'TRY'`);
    }
    for (const table of ['QuoteItem', 'RecurringInvoiceItem']) {
      const body = sql.split(`CREATE TABLE "${table}" (`)[1].split(');')[0];
      expect(body, table).toContain(`"taxLabel" TEXT NOT NULL DEFAULT 'KDV'`);
    }
  });

  it('the server fills currency and label from the company', () => {
    expect(companyCurrency(undefined, { defaultCurrency: 'EUR' })).toBe('EUR');
    expect(companyCurrency('USD', { defaultCurrency: 'TRY' })).toBe('USD');
    expect(companyCurrency(undefined, null)).toBe('TRY');
    const items = [{ taxLabel: 'VAT' }, { taxLabel: '' }, { taxLabel: 'ÖTV' }];
    expect(applyCompanyTaxLabel(items, 'TR').map((i) => i.taxLabel)).toEqual(['KDV', 'KDV', 'ÖTV']);
    expect(applyCompanyTaxLabel(items, 'US').map((i) => i.taxLabel)).toEqual(['VAT', '', 'ÖTV']);
    for (const file of ['app/api/quotes/route.ts', 'app/api/recurring-invoices/route.ts']) {
      const route = src(file);
      expect(route, file).toContain('companyCurrency(data.currency, company)');
      expect(route, file).toContain('applyCompanyTaxLabel(data.items, company?.country)');
      expect(route, file).not.toContain("?? 'USD'");
    }
  });
});

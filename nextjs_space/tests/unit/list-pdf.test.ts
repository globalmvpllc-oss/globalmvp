import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { NOTO_SANS_REGULAR_BASE64 } from '@/lib/pdf/fonts/noto-sans-regular';

// The loader is server-only and talks to Prisma; both are replaced here so the
// filter each list PDF applies can be checked without a database.
const { calls, rowsFor, model } = vi.hoisted(() => {
  const calls: Record<string, any[]> = {};
  const rowsFor: Record<string, any[]> = {};
  const model = (name: string) => ({
    findMany: async (args: any) => {
      (calls[name] ??= []).push(args);
      return rowsFor[name] ?? [];
    },
    findFirst: async (args: any) => {
      (calls[`${name}.findFirst`] ??= []).push(args);
      return rowsFor[`${name}.findFirst`]?.[0] ?? null;
    },
  });
  return { calls, rowsFor, model };
});
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: model('invoice'),
    quote: model('quote'),
    recurringInvoice: model('recurringInvoice'),
    customer: model('customer'),
    vendor: model('vendor'),
    expenseTransaction: model('expenseTransaction'),
    incomeTransaction: model('incomeTransaction'),
    payment: model('payment'),
    chequeInstrument: model('chequeInstrument'),
    bankTransaction: model('bankTransaction'),
    bankAccount: model('bankAccount'),
  },
}));

import {
  LIST_PDF_KINDS,
  LIST_PDF_MAX_ROWS,
  buildListPdfSpec,
  renderListPdf,
  listContext,
  invoicesBody,
  recurringAmount,
  reportsBody,
  vatBody,
} from '@/lib/pdf/list-pdf';
import { loadListDocument } from '@/lib/pdf/list-data';
import { bankTransactionWhere } from '@/lib/banking/transaction-filter';
import { buildInvoicePdfSpec } from '@/lib/pdf/invoice-pdf';
import { emptyTotals } from '@/lib/reports-aggregate';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

const company = {
  name: 'TEST- Örnek Gıda Ltd. Şti.',
  country: 'TR',
  taxNumber: '1234567890',
  taxOffice: 'Kadıköy',
  primaryColor: '#7C3AED',
};

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(rowsFor)) delete rowsFor[k];
});

describe('every list and report screen has a "PDF indir" button', () => {
  const pages: Array<[string, string]> = [
    ['app/(app)/invoices/page.tsx', 'invoices'],
    ['app/(app)/quotes/page.tsx', 'quotes'],
    ['app/(app)/recurring/page.tsx', 'recurring'],
    ['app/(app)/customers/page.tsx', 'customers'],
    ['app/(app)/vendors/page.tsx', 'vendors'],
    ['app/(app)/expenses/page.tsx', 'expenses'],
    ['app/(app)/income/page.tsx', 'income'],
    ['app/(app)/payments/page.tsx', 'payments'],
    ['app/(app)/cheques/page.tsx', 'cheques'],
    ['app/(app)/banking/page.tsx', 'bank-accounts'],
    ['app/(app)/banking/reconcile/page.tsx', 'bank-transactions'],
    ['app/(app)/reports/vat/page.tsx', 'vat'],
    ['app/(app)/reports/page.tsx', 'reports'],
  ];

  it.each(pages)('%s → %s', (file, kind) => {
    expect(src(file)).toContain(`<ListPdfButton kind="${kind}"`);
  });

  it('covers every kind the route serves', () => {
    expect(new Set(pages.map(([, k]) => k))).toEqual(new Set(LIST_PDF_KINDS));
  });

  it('passes the filter the screen is showing', () => {
    expect(src('app/(app)/invoices/page.tsx')).toContain('params={{ status: statusFilter }}');
    expect(src('app/(app)/quotes/page.tsx')).toContain('params={{ status }}');
    expect(src('app/(app)/cheques/page.tsx')).toContain('params={{ direction: directionFilter, status: statusFilter }}');
    expect(src('app/(app)/banking/reconcile/page.tsx')).toContain(
      'params={{ bankAccountId: accountFilter, status: statusFilter }}'
    );
    expect(src('app/(app)/reports/vat/page.tsx')).toContain('params={{ from: range.from, to: range.to }}');
  });

  it('detail pages say "PDF indir" too', () => {
    expect(src('app/(app)/invoices/[id]/page.tsx')).toContain("t('listPdf.download')");
    expect(src('app/(app)/quotes/[id]/page.tsx')).toContain("t('listPdf.download')");
  });
});

describe('plan allowance', () => {
  it('list and report PDFs are not counted', () => {
    const route = src('app/api/pdf/[kind]/route.ts');
    expect(route).toContain('requireUserCompany');
    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).not.toMatch(/enforcePlanLimit\(/);
    expect(route).not.toContain("from '@/lib/billing/limits'");
  });

  it('invoice and quote PDFs still are', () => {
    expect(src('app/api/invoices/[id]/pdf/route.ts')).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
    expect(src('app/api/quotes/[id]/pdf/route.ts')).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
  });
});

describe('invoice PDF title', () => {
  it('is PROFORMA FATURA with the informational notice', () => {
    const spec = buildInvoicePdfSpec(
      { invoiceNumber: 'F-1', currency: 'TRY', items: [], customer: { name: 'Ayşe', country: 'TR' } },
      company
    );
    expect(spec.title).toBe('PROFORMA FATURA');
    expect(JSON.stringify(spec.blocks)).toContain('Bu belge bilgilendirme amaçlıdır');
  });
});

describe('the list PDF uses the screen filter', () => {
  const p = (q: string) => new URLSearchParams(q);

  it('invoices: status, and the company from the session only', async () => {
    const r = await loadListDocument('invoices', 'co-1', 'tr', p('status=PAID&companyId=other'));
    expect(r.ok).toBe(true);
    expect(calls.invoice[0].where).toEqual({ companyId: 'co-1', status: 'PAID' });
    expect(calls.invoice[0].take).toBe(LIST_PDF_MAX_ROWS + 1);
    if (r.ok) expect(r.filters).toEqual([{ label: 'Durum', value: 'Ödendi' }]);
  });

  it('invoices: ALL means no status filter', async () => {
    const r = await loadListDocument('invoices', 'co-1', 'tr', p('status=ALL'));
    expect(calls.invoice[0].where).toEqual({ companyId: 'co-1' });
    if (r.ok) expect(r.filters).toEqual([]);
  });

  it('invoices: a malformed date is a 400, not an unfiltered list', async () => {
    const r = await loadListDocument('invoices', 'co-1', 'tr', p('from=yarın'));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls.invoice).toBeUndefined();
  });

  it('quotes: only known statuses filter', async () => {
    await loadListDocument('quotes', 'co-1', 'tr', p('status=ACCEPTED'));
    await loadListDocument('quotes', 'co-1', 'tr', p('status=BOGUS'));
    expect(calls.quote[0].where).toEqual({ companyId: 'co-1', status: 'ACCEPTED' });
    expect(calls.quote[1].where).toEqual({ companyId: 'co-1' });
  });

  it('cheques: direction and status, worded in the filter line', async () => {
    const r = await loadListDocument('cheques', 'co-1', 'tr', p('direction=RECEIVED&status=PORTFOLIO'));
    expect(calls.chequeInstrument[0].where).toEqual({ companyId: 'co-1', direction: 'RECEIVED', status: 'PORTFOLIO' });
    if (r.ok) expect(r.filters.map((f) => f.label)).toEqual(['Yön', 'Durum']);
  });

  it('bank reconciliation: same where clause as the screen API', async () => {
    rowsFor['bankAccount.findFirst'] = [{ bankName: 'Örnek Bankası', accountName: 'Vadesiz TL' }];
    const r = await loadListDocument('bank-transactions', 'co-1', 'tr', p('bankAccountId=acc-1&status=UNMATCHED'));
    expect(calls.bankTransaction[0].where).toEqual(
      bankTransactionWhere('co-1', { bankAccountId: 'acc-1', status: 'UNMATCHED', search: '' })
    );
    // The account name is looked up inside the company.
    expect(calls['bankAccount.findFirst'][0].where).toEqual({ id: 'acc-1', companyId: 'co-1' });
    if (r.ok) expect(r.filters[0]).toEqual({ label: 'Hesap', value: 'Örnek Bankası – Vadesiz TL' });
  });

  it('marks a cut-off list', async () => {
    rowsFor.customer = Array.from({ length: LIST_PDF_MAX_ROWS + 1 }, (_, i) => ({ name: `M${i}` }));
    const r = await loadListDocument('customers', 'co-1', 'tr', p(''));
    expect(r.ok && r.truncatedAt).toBe(LIST_PDF_MAX_ROWS);
    expect(r.ok && r.body.recordCount).toBe(LIST_PDF_MAX_ROWS);
  });

  it('the period line names the last included day', async () => {
    const r = await loadListDocument('payments', 'co-1', 'tr', p('from=2026-11-01&to=2026-12-01'));
    if (r.ok) expect(r.filters).toEqual([{ label: 'Dönem', value: '01.11.2026 – 30.11.2026' }]);
  });
});

describe('list document content', () => {
  const ctx = listContext('tr');
  const rows = [
    { invoiceNumber: 'F-1', customer: { name: 'Çağrı Öztürk' }, status: 'PAID', issueDate: '2026-11-01', dueDate: '2026-11-15', currency: 'TRY', total: '1200.00', amountPaid: '1200.00' },
    { invoiceNumber: 'F-2', customer: { name: 'İpek Şahin' }, status: 'SENT', issueDate: '2026-11-02', dueDate: '2026-11-20', currency: 'TRY', total: '300.50', amountPaid: '0' },
    { invoiceNumber: 'F-3', customer: { name: 'Global Ltd' }, status: 'SENT', issueDate: '2026-11-03', dueDate: '2026-11-30', currency: 'USD', total: '99.99', amountPaid: '0' },
  ];

  it('totals each currency separately', () => {
    const body = invoicesBody(rows, ctx);
    const totals: any = body.blocks.find((b) => b.kind === 'totals');
    expect(totals.lines.map((l: any) => l.label)).toEqual(['Toplam (TRY)', 'Kalan (TRY)', 'Toplam (USD)', 'Kalan (USD)']);
    expect(totals.lines[0].value).toBe(ctx.money('1500.50', 'TRY'));
    expect(totals.lines[1].value).toBe(ctx.money('300.50', 'TRY'));
    expect(body.recordCount).toBe(3);
  });

  it('header: title, record count, filter box; no addressee', () => {
    const spec = buildListPdfSpec({
      kind: 'invoices',
      locale: 'tr',
      company,
      filters: [{ label: 'Durum', value: 'Gönderildi' }],
      body: invoicesBody(rows, ctx),
      generatedAt: new Date('2026-11-04T10:00:00Z'),
    });
    expect(spec.title).toBe('FATURA LİSTESİ');
    expect(spec.party).toBeNull();
    expect(spec.meta).toEqual([
      { label: 'Oluşturulma', value: '04.11.2026' },
      { label: 'Kayıt sayısı', value: '3' },
    ]);
    expect(spec.blocks[0]).toMatchObject({ kind: 'text', title: 'Filtre', body: 'Durum: Gönderildi' });
  });

  it('says when there is no filter, and when the list was cut off', () => {
    const spec = buildListPdfSpec({ kind: 'customers', locale: 'tr', company, filters: [], body: { blocks: [] }, truncatedAt: 2000 });
    expect(spec.blocks[0]).toMatchObject({ body: 'Filtre yok: tüm kayıtlar' });
    expect((spec.blocks[1] as any).body).toContain('ilk 2000 kaydı');
  });

  it('every character it prints is in the embedded font (Turkish letters included)', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(Buffer.from(NOTO_SANS_REGULAR_BASE64, 'base64'), { subset: true });
    const set = new Set(font.getCharacterSet());
    const specs = LIST_PDF_KINDS.map((kind) =>
      buildListPdfSpec({ kind, locale: 'tr', company, filters: [{ label: 'Dönem', value: '01.11.2026 – 30.11.2026' }], body: invoicesBody(rows, ctx) })
    );
    const text = JSON.stringify(specs.map((s) => [s.title, s.meta, s.blocks, s.issuer]));
    const missing = [...new Set([...text].filter((ch) => !set.has(ch.codePointAt(0)!)))];
    expect(missing).toEqual([]);
    for (const ch of 'çğıİöşüÇĞÖŞÜ₺') expect(text.includes(ch) || set.has(ch.codePointAt(0)!)).toBe(true);
  });

  it('renders a real, multi-page PDF for a long list', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[i % 3], invoiceNumber: `F-${i + 1}` }));
    const bytes = await renderListPdf({ kind: 'invoices', locale: 'tr', company, filters: [], body: invoicesBody(many, ctx) });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    expect(parsed.getTitle()).toBe('FATURA LİSTESİ');
  });

  it('recurring amount follows the screen formula', () => {
    expect(recurringAmount([{ quantity: 2, unitPrice: 100, discount: 20, taxRate: 20 }]).toFixed(2)).toBe('216.00');
  });

  it('VAT and finance report bodies', () => {
    const vat = vatBody(
      [{ currency: 'TRY', output: [{ rate: '20', base: '1000.00', tax: '200.00', count: 1 }], outputBase: '1000.00', outputTax: '200.00', input: [], inputBase: '0.00', inputTax: '0.00', net: '200.00' } as any],
      ctx
    );
    expect(JSON.stringify(vat.blocks)).toContain('Hesaplanan KDV');
    const report = reportsBody(
      {
        currencies: ['TRY'],
        byCurrency: { TRY: { ...emptyTotals(), income: '500.00', profit: '500.00' } },
        monthly: { TRY: [{ monthKey: '2026-11', month: 'Nov', income: 500, expenses: 0 } as any] },
        expenseCategories: { TRY: [] },
        invoiceStatusCounts: [{ name: 'PAID', value: 2 }],
        hasRecords: true,
      },
      ctx
    );
    const text = JSON.stringify(report.blocks);
    expect(text).toContain('Toplam gelir');
    expect(text).toContain('Kasım 2026');
    expect(text).toContain('Ödendi');
  });
});

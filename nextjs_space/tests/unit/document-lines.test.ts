import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { documentTotalsLines, hasLineDiscount, lineNetAmount } from '@/lib/document-lines';
import { buildInvoicePdfSpec, buildQuotePdfSpec } from '@/lib/pdf/invoice-pdf';
import { listContext, reportsBody, vatBody } from '@/lib/pdf/list-pdf';
import { emptyTotals } from '@/lib/reports-aggregate';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

const company = {
  name: 'Örnek Ltd',
  country: 'TR',
  paymentInstructions: 'Ödemeyi son ödeme tarihine kadar yapınız; açıklamaya fatura numarasını yazınız.',
  bankTransferInstructions: 'IBAN: TR00 0000',
};
// 12 × 85 at 1 %, and 1 × 4500 − 250 at 20 %; stored totals as invoice-calc wrote them.
const items = [
  { description: 'Reçel', quantity: 12, unitPrice: 85, discount: 0, taxRate: 1, taxLabel: 'KDV', amount: 1030.2 },
  { description: 'Danışmanlık', quantity: 1, unitPrice: 4500, discount: 250, taxRate: 20, taxLabel: 'KDV', amount: 5100 },
];
const doc = {
  invoiceNumber: 'F-1',
  quoteNumber: 'T-1',
  currency: 'TRY',
  subtotal: 5520,
  discountTotal: 250,
  taxTotal: 860.2,
  total: 6130.2,
  items,
  customer: { name: 'Ayşe', country: 'TR' },
};

const table = (spec: any) => spec.blocks.find((b: any) => b.kind === 'table');
const totals = (spec: any) => spec.blocks.find((b: any) => b.kind === 'totals');
const texts = (spec: any) => spec.blocks.filter((b: any) => b.kind === 'text');

describe('line amounts: before VAT, after the line discount', () => {
  it('net per line', () => {
    expect(lineNetAmount(items[0]).toFixed(2)).toBe('1020.00');
    expect(lineNetAmount(items[1]).toFixed(2)).toBe('4250.00');
  });

  it('invoice PDF prints the net amount and shows the discount column', () => {
    const spec = buildInvoicePdfSpec(doc, company);
    const t = table(spec);
    expect(t.columns.map((c: any) => c.label)).toEqual(['Açıklama', 'Miktar', 'Birim fiyat', 'İndirim', 'KDV', 'Tutar']);
    expect(t.rows[0].cells[5]).toBe('₺1.020,00');
    expect(t.rows[1].cells[3]).toBe('-₺250,00');
    expect(t.rows[1].cells[5]).toBe('₺4.250,00');
  });

  it('no discount anywhere → no discount column', () => {
    const plain = { ...doc, discountTotal: 0, items: [items[0]] };
    expect(hasLineDiscount(plain.items)).toBe(false);
    expect(table(buildInvoicePdfSpec(plain, company)).columns.map((c: any) => c.label)).toEqual([
      'Açıklama', 'Miktar', 'Birim fiyat', 'KDV', 'Tutar',
    ]);
  });

  it('totals: subtotal, discount, VAT per rate, grand total — stored figures unchanged', () => {
    const lines = totals(buildInvoicePdfSpec(doc, company)).lines;
    expect(lines.map((l: any) => l.label)).toEqual(['Ara toplam', 'İndirim', 'KDV %20', 'KDV %1', 'Genel toplam']);
    expect(lines.map((l: any) => l.value)).toEqual(['₺5.520,00', '-₺250,00', '₺850,00', '₺10,20', '₺6.130,20']);
    const raw = documentTotalsLines(doc);
    expect(raw[0]).toEqual({ kind: 'subtotal', amount: '5520.00' });
    expect(raw[raw.length - 1]).toEqual({ kind: 'total', amount: '6130.20' });
  });

  it('the quote PDF has the same layout', () => {
    const spec = buildQuotePdfSpec(doc, company);
    expect(table(spec).columns.map((c: any) => c.label)).toContain('İndirim');
    expect(totals(spec).lines.map((l: any) => l.label)).toEqual(['Ara toplam', 'İndirim', 'KDV %20', 'KDV %1', 'Genel toplam']);
  });

  it('detail screens use the same component', () => {
    for (const file of ['app/(app)/invoices/[id]/page.tsx', 'app/(app)/quotes/[id]/page.tsx']) {
      expect(src(file)).toContain('<DocumentLines doc=');
    }
  });
});

describe('quote payment note', () => {
  it('replaces the due-date sentence and keeps bank details', () => {
    const spec = buildQuotePdfSpec(doc, company);
    const bodies = texts(spec).map((b: any) => `${b.title}: ${b.body}`);
    expect(bodies).toContain('Ödeme bilgisi: Teklifi onaylamak için bizimle iletişime geçebilirsiniz.');
    expect(bodies.join(' ')).not.toContain('son ödeme tarihine');
    expect(bodies.join(' ')).toContain('IBAN: TR00 0000');
  });

  it('the invoice keeps the company sentence', () => {
    expect(JSON.stringify(buildInvoicePdfSpec(doc, company).blocks)).toContain('son ödeme tarihine');
  });
});

describe('VAT report wording', () => {
  const ctx = listContext('tr');
  const cur = (net: string) => ({
    currency: 'TRY', output: [], outputBase: '0.00', outputTax: '0.00', input: [], inputBase: '0.00', inputTax: '0.00', net,
  });

  it('payable when positive, carried forward when negative, without the minus sign', () => {
    const pay = JSON.stringify(vatBody([cur('200.00') as any], ctx).blocks);
    expect(pay).toContain('Ödenecek KDV');
    const carry = vatBody([cur('-150.00') as any], ctx);
    const rows = (carry.blocks[0] as any).rows;
    expect(rows[rows.length - 1].cells).toEqual(['Devreden KDV', '', '', '₺150,00']);
    expect(JSON.stringify(carry.blocks)).not.toContain('Fark');
  });

  it('carries the information-only notice, on screen too', () => {
    expect(JSON.stringify(vatBody([cur('0.00') as any], ctx).blocks)).toContain(
      'Bu rapor bilgilendirme amaçlıdır; KDV beyannamesi yerine geçmez.'
    );
    expect(src('app/(app)/reports/vat/page.tsx')).toContain("t('vat.notice')");
  });
});

describe('finance report', () => {
  const ctx = listContext('tr');
  const report = {
    currencies: ['EUR', 'TRY', 'USD'],
    byCurrency: {
      EUR: { ...emptyTotals(), profit: '-450.00' },
      TRY: { ...emptyTotals(), profit: '1200.00' },
      USD: { ...emptyTotals(), profit: '0.00' },
    },
    monthly: {},
    expenseCategories: {},
    invoiceStatusCounts: [],
    hasRecords: true,
  };

  it("company's own currency first", () => {
    const headings = reportsBody(report as any, ctx, 'TRY').blocks.filter((b: any) => b.heading).map((b: any) => b.heading);
    expect(headings).toEqual(['Özet (TRY)', 'Özet (EUR)', 'Özet (USD)']);
  });

  it('a negative result reads as a loss', () => {
    const blocks: any[] = reportsBody(report as any, ctx, 'TRY').blocks;
    const eur = blocks.find((b) => b.heading === 'Özet (EUR)');
    const try_ = blocks.find((b) => b.heading === 'Özet (TRY)');
    expect(eur.rows[2].cells).toEqual(['Zarar', '€450,00']);
    expect(try_.rows[2].cells).toEqual(['Kâr', '₺1.200,00']);
  });
});

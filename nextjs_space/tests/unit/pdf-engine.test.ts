import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import Decimal from 'decimal.js';
import { renderBusinessDocumentPdf, logoFromDataUrl, wrapText } from '@/lib/pdf/engine';
import { buildInvoicePdfSpec, renderInvoicePdf, taxBreakdown, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { buildStatementPdfSpec, renderStatementPdf } from '@/lib/pdf/statement-pdf';
import { NOTO_SANS_REGULAR_BASE64 } from '@/lib/pdf/fonts/noto-sans-regular';
import { NOTO_SANS_BOLD_BASE64 } from '@/lib/pdf/fonts/noto-sans-bold';
import { generateBulkPdfZip, fetchInvoicePdf, PDF_OPTIONS } from '@/lib/bulk-pdf';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

const trCompany = {
  name: 'Örnek Ltd',
  country: 'TR',
  taxNumber: '1234567890',
  taxOffice: 'Beşiktaş',
  paymentInstructions: 'Fatura numarasını açıklamaya yazınız.',
};
const items = [
  { description: 'Danışmanlık', quantity: 1, unitPrice: 1000, discount: 100, taxRate: 20, taxLabel: 'KDV', amount: 1080 },
  { description: 'Kitap', quantity: 2, unitPrice: 50, discount: 0, taxRate: 10, taxLabel: 'KDV', amount: 110 },
  { description: 'Reçel', quantity: 3, unitPrice: 10, discount: 0, taxRate: 1, taxLabel: 'VAT', amount: 30.3 },
  { description: 'Muaf', quantity: 1, unitPrice: 5, discount: 0, taxRate: 0, taxLabel: 'KDV', amount: 5 },
];
const trInvoice = {
  invoiceNumber: 'FTR-0001',
  issueDate: '2026-11-04',
  dueDate: '2026-12-04',
  currency: 'TRY',
  subtotal: 1135,
  discountTotal: 100,
  taxTotal: 190.3,
  total: 1225.3,
  amountPaid: 225.3,
  notes: 'Teşekkürler.',
  customer: { name: 'Ayşe Yılmaz', country: 'TR', taxId: '12345678901', taxOffice: 'Kadıköy', email: 'a@x.test' },
  items,
};

const allText = (spec: any) => JSON.stringify(spec);

describe('embedded fonts', () => {
  it('cover every Turkish letter and the currency signs', async () => {
    for (const b64 of [NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64]) {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(Buffer.from(b64, 'base64'), { subset: true });
      const set = new Set(font.getCharacterSet());
      for (const ch of 'çğıİöşüÇĞÖŞÜ₺€£$') expect(set.has(ch.codePointAt(0)!), ch).toBe(true);
    }
  });

  it('are small subsets with their licence alongside', () => {
    expect(NOTO_SANS_REGULAR_BASE64.length).toBeLessThan(80_000);
    expect(existsSync(path.join(root, 'lib/pdf/fonts/OFL.txt'))).toBe(true);
  });
});

describe('invoice PDF content (spec)', () => {
  const spec = buildInvoicePdfSpec(trInvoice, trCompany);

  it('is Turkish for a Turkish customer, titled PROFORMA FATURA until it is an e-document', () => {
    expect(spec.title).toBe('PROFORMA FATURA');
    expect(buildInvoicePdfSpec({ ...trInvoice, eDocumentUuid: 'ettn-1' }, trCompany).title).toBe('FATURA');
    expect(spec.party.heading).toBe('Sayın');
    expect(spec.meta.map((m) => m.label)).toEqual(['Düzenleme tarihi', 'Son ödeme tarihi']);
    expect(spec.meta[0].value).toBe('4 Kasım 2026');
  });

  it('carries the customer TCKN and tax office, and the company tax line', () => {
    expect(spec.party.lines).toContain('TCKN: 12345678901 • Vergi dairesi: Kadıköy');
    expect(spec.issuer.lines).toContain('Vergi no: 1234567890 • Vergi dairesi: Beşiktaş');
  });

  it('breaks KDV down per rate, highest first, skipping 0%', () => {
    const totals = spec.blocks.find((b) => b.kind === 'totals') as any;
    const labels = totals.lines.map((l: any) => l.label);
    expect(labels).toEqual(['Ara toplam', 'İndirim', 'KDV %20', 'KDV %10', 'KDV %1', 'Genel toplam', 'Ödenen', 'Kalan tutar']);
  });

  it('the breakdown adds up to the stored tax total', () => {
    const sum = taxBreakdown(items).reduce((s, r) => s.plus(r.tax), new Decimal(0));
    expect(sum.toFixed(2)).toBe('190.30');
  });

  it('prints the informational notice for a Turkish company only', () => {
    expect(allText(spec)).toContain('Bu belge bilgilendirme amaçlıdır; yasal e-Arşiv/e-Fatura yerine geçmez.');
    const us = buildInvoicePdfSpec({ ...trInvoice, customer: { name: 'Bob' } }, { name: 'Acme', country: 'US' });
    expect(allText(us)).not.toContain('e-Arşiv');
    expect(us.title).toBe('INVOICE');
  });

  it('hides the tax lines when the company turned them off', () => {
    const hidden = buildInvoicePdfSpec(trInvoice, { ...trCompany, invoiceShowTax: false });
    const totals = hidden.blocks.find((b) => b.kind === 'totals') as any;
    expect(totals.lines.some((l: any) => l.label.startsWith('KDV'))).toBe(false);
  });

  it('includes notes and payment instructions', () => {
    expect(allText(spec)).toContain('Teşekkürler.');
    expect(allText(spec)).toContain('Fatura numarasını açıklamaya yazınız.');
  });

  it('an English customer gets English labels', () => {
    const en = buildInvoicePdfSpec({ ...trInvoice, customer: { ...trInvoice.customer, language: 'en' } }, trCompany);
    expect(en.title).toBe('PROFORMA INVOICE');
    expect(en.party.heading).toBe('Bill To');
  });

  it('file names are safe', () => {
    expect(invoicePdfFileName('FTR/2026 01')).toBe('FTR_2026_01.pdf');
  });
});

describe('PDF rendering', () => {
  it('produces a valid one-page A4 PDF with Turkish metadata', async () => {
    const bytes = await renderInvoicePdf(trInvoice, trCompany, new Date('2026-11-04T09:00:00Z'));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe('PROFORMA FATURA FTR-0001');
  });

  it('flows long invoices onto more pages', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...items[0], description: `Kalem ${i + 1} — uzun açıklama metni ` .repeat(2) }));
    const bytes = await renderInvoicePdf({ ...trInvoice, items: many }, trCompany);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('does not fail on characters the font lacks', async () => {
    const bytes = await renderInvoicePdf(
      { ...trInvoice, notes: 'Emoji 🎉 ve Кириллица 漢字', items: [{ ...items[0], description: '✓ özel' }] },
      trCompany
    );
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('embeds a PNG logo and ignores WebP', async () => {
    // 1×1 transparent PNG
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    expect(logoFromDataUrl(png)?.type).toBe('png');
    expect(logoFromDataUrl('data:image/webp;base64,AAAA')).toBeNull();
    expect(logoFromDataUrl('javascript:alert(1)')).toBeNull();
    const bytes = await renderInvoicePdf(trInvoice, { ...trCompany, logoUrl: png });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('wraps text to the width', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(Buffer.from(NOTO_SANS_REGULAR_BASE64, 'base64'));
    const lines = wrapText('bir iki üç dört beş altı yedi sekiz dokuz on', font, 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(60);
  });

  it('uses the same page margins as before', () => {
    expect(PDF_OPTIONS.format).toBe('A4');
    expect(PDF_OPTIONS.margin).toEqual({ top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' });
  });

  it('renders a generic document (the base quotes will use)', async () => {
    const bytes = await renderBusinessDocumentPdf({
      title: 'TEKLİF',
      number: 'TKL-1',
      issuer: { name: 'Örnek', lines: [] },
      party: { heading: 'Sayın', name: 'Ayşe', lines: [] },
      meta: [],
      blocks: [{ kind: 'text', body: 'Geçerlilik: 30 gün' }],
    });
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('TEKLİF TKL-1');
  });
});

describe('statement PDF', () => {
  const section = {
    currency: 'TRY',
    opening: '0.00',
    rows: [
      { date: '2026-11-01', kind: 'invoice', reference: 'FTR-1', description: 'Mal satışı', debit: '1200.00', credit: '0.00', balance: '1200.00' },
      { date: '2026-11-03', kind: 'payment', reference: 'bank_transfer', description: '', debit: '0.00', credit: '200.00', balance: '1000.00' },
    ],
    debitTotal: '1200.00',
    creditTotal: '200.00',
    closing: '1000.00',
    accountBalance: '1000.00',
    movementCount: 2,
  } as any;

  it('lists opening, movements, totals and closing in Turkish', () => {
    const spec = buildStatementPdfSpec({ locale: 'tr', party: { name: 'Ayşe', taxOffice: 'Konak' }, company: trCompany, sections: [section] });
    const table = spec.blocks[0] as any;
    expect(table.rows[0].cells[0]).toBe('Açılış bakiyesi');
    expect(table.rows[4].cells[0]).toBe('Kapanış bakiyesi');
    expect(table.rows).toHaveLength(5);
    expect(table.rows[2].cells[2]).not.toBe('bank_transfer');
    expect(allText(spec)).toContain('Vergi dairesi: Konak');
  });

  it('renders', async () => {
    const bytes = await renderStatementPdf({ locale: 'en', party: { name: 'Bob' }, company: { name: 'Acme' }, sections: [section] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe('bulk download uses the server PDF', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches each invoice from /api/invoices/[id]/pdf and zips them', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
    }));
    const result = await generateBulkPdfZip([{ name: 'A', id: 'a1' }, { name: 'B', id: 'b 2' }]);
    expect(urls).toEqual(['/api/invoices/a1/pdf', '/api/invoices/b%202/pdf']);
    expect(result.succeeded).toEqual(['A', 'B']);
    expect(result.zip).not.toBeNull();
  });

  it('stops when the monthly allowance runs out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 402 })));
    const result = await generateBulkPdfZip([{ name: 'A', id: 'a' }, { name: 'B', id: 'b' }]);
    expect(result.stoppedBecause).toBe('limit-reached');
    expect(result.failed).toHaveLength(2);
    expect(result.zip).toBeNull();
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchInvoicePdf('x')).toEqual({ reason: 'network' });
  });
});

describe('no external PDF service is left', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it('nothing reads ABACUSAI_API_KEY or calls abacus.ai', () => {
    for (const dir of ['app', 'lib', 'components']) {
      for (const file of walk(path.join(root, dir)).filter((f) => /\.(ts|tsx)$/.test(f))) {
        const text = readFileSync(file, 'utf8');
        expect(text.includes('ABACUSAI_API_KEY'), file).toBe(false);
        expect(text.includes('abacus.ai'), file).toBe(false);
      }
    }
  });

  it('the old HTML → PDF endpoints are gone', () => {
    expect(existsSync(path.join(root, 'app/api/generate-pdf/route.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'app/api/generate-pdf/status/route.ts'))).toBe(false);
  });

  it('every PDF route is company-scoped and counts against the plan allowance', () => {
    const invoiceRoute = src('app/api/invoices/[id]/pdf/route.ts');
    expect(invoiceRoute).toContain('where: { id: params.id, companyId }');
    expect(invoiceRoute).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
    for (const file of ['app/api/customers/[id]/statement/route.ts', 'app/api/vendors/[id]/statement/route.ts']) {
      const route = src(file);
      expect(route, file).toContain("searchParams.get('format') === 'pdf'");
      expect(route, file).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
    }
    expect(src('app/api/invoices/[id]/send/route.ts')).toContain("enforcePlanLimit(companyId, 'invoicePdfPerMonth')");
  });

  it('email and reminders attach the in-house PDF', () => {
    expect(src('app/api/invoices/[id]/send/route.ts')).toContain('renderInvoicePdf(');
    expect(src('lib/cron/jobs.ts')).toContain('renderInvoicePdf(');
  });
});

describe('onboarding is translated', () => {
  const page = src('app/onboarding/page.tsx');
  it('uses the dictionary for every visible label', () => {
    expect(page).toContain("useI18n()");
    for (const english of ['>Business name<', "'Finish setup'", '> Back<', 'Next <', 'placeholder="Street address"']) {
      expect(page.includes(english), english).toBe(false);
    }
  });
  it('still stores English business types', () => {
    expect(page).toContain("{ value: 'Sole Proprietor', labelKey: 'onboarding.type.soleProprietor' }");
  });
});

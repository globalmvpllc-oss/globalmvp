/**
 * Writes one sample of every PDF the app produces, with made-up data, for
 * visual review:
 *
 *   npx tsx scripts/sample-pdfs.ts ../docs/ornek-pdf
 *
 * No database, no network. Every name and number below is fictional and
 * carries the TEST- prefix. The builders are the ones the routes use, so a
 * sample looks exactly like the real download.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { renderInvoicePdf, renderQuotePdf } from '../lib/pdf/invoice-pdf';
import { renderStatementPdf } from '../lib/pdf/statement-pdf';
import { buildStatement } from '../lib/statement-ledger';
import {
  renderListPdf,
  listContext,
  invoicesBody,
  quotesBody,
  recurringBody,
  customersBody,
  vendorsBody,
  expensesBody,
  incomeBody,
  paymentsBody,
  chequesBody,
  bankTransactionsBody,
  bankAccountsBody,
  vatBody,
  reportsBody,
  type ListPdfKind,
  type ListBody,
} from '../lib/pdf/list-pdf';
import { buildVatReport } from '../lib/vat-report';
import { buildReport } from '../lib/reports-aggregate';

const outDir = path.resolve(process.argv[2] ?? 'ornek-pdf');
mkdirSync(outDir, { recursive: true });
const createdAt = new Date('2026-11-04T09:00:00Z');
const ctx = listContext('tr');

const company = {
  name: 'TEST- Örnek Gıda Ticaret Ltd. Şti.',
  legalName: 'TEST- Örnek Gıda Ticaret Limited Şirketi',
  country: 'TR',
  address: 'Çiçek Sokak No: 12/3',
  city: 'İstanbul',
  postalCode: '34710',
  email: 'muhasebe@ornek.test',
  phone: '+90 000 000 00 00',
  website: 'ornek.test',
  taxNumber: '1234567890',
  taxOffice: 'Kadıköy',
  primaryColor: '#7C3AED',
  invoiceFooter: 'Örnek Gıda — Teşekkür ederiz.',
  paymentInstructions: 'Ödemeyi son ödeme tarihine kadar yapınız; açıklamaya fatura numarasını yazınız.',
  bankTransferInstructions: 'Banka: Örnek Bankası • IBAN: TR00 0000 0000 0000 0000 0000 00 • Alıcı: Örnek Gıda Ltd. Şti.',
  invoiceShowTax: true,
  invoiceShowLogo: true,
};

const customers = [
  { name: 'TEST- Ayşe Yılmaz', companyName: 'TEST- Yılmaz Pastacılık', email: 'ayse@ornek.test', phone: '+90 000 000 00 01', taxId: '12345678901', taxOffice: 'Konak', city: 'İzmir', country: 'TR', address: 'Gül Caddesi No: 5', postalCode: '35210' },
  { name: 'TEST- Çağrı Öztürk', companyName: 'TEST- Öztürk Şarküteri', email: 'cagri@ornek.test', phone: '+90 000 000 00 02', taxId: '9876543210', taxOffice: 'Çankaya', city: 'Ankara', country: 'TR' },
  { name: 'TEST- İpek Şahin', companyName: null, email: 'ipek@ornek.test', phone: '', taxId: '', taxOffice: '', city: 'Muğla', country: 'TR' },
  { name: 'TEST- Global Foods GmbH', companyName: 'TEST- Global Foods', email: 'office@global.test', phone: '+49 000 0000', taxId: 'DE000000000', taxOffice: '', city: 'Köln', country: 'DE' },
];
const vendors = [
  { name: 'TEST- Güneş Ambalaj', companyName: 'TEST- Güneş Ambalaj San. A.Ş.', email: 'satis@gunes.test', phone: '+90 000 000 00 10', taxId: '1111111111', taxOffice: 'Gebze', country: 'TR' },
  { name: 'TEST- Şimşek Lojistik', companyName: null, email: 'info@simsek.test', phone: '+90 000 000 00 11', taxId: '2222222222', taxOffice: 'Bayrampaşa', country: 'TR' },
];

const items = [
  { description: 'Şeftali reçeli (12 kavanoz, ılık depoda saklanır)', quantity: 12, unitPrice: 85, discount: 0, taxRate: 1, taxLabel: 'KDV' },
  { description: 'Danışmanlık hizmeti — Ekim ayı', quantity: 1, unitPrice: 4500, discount: 250, taxRate: 20, taxLabel: 'KDV' },
  { description: 'Kargo ve ambalaj (İzmir şubesine gönderim)', quantity: 2, unitPrice: 150, discount: 0, taxRate: 20, taxLabel: 'KDV' },
];
function priced(list: typeof items) {
  let subtotal = 0, discountTotal = 0, taxTotal = 0;
  const lines = list.map((item) => {
    const base = item.quantity * item.unitPrice;
    const taxable = base - item.discount;
    const tax = (taxable * item.taxRate) / 100;
    subtotal += base; discountTotal += item.discount; taxTotal += tax;
    return { ...item, amount: Math.round((taxable + tax) * 100) / 100 };
  });
  const r = (n: number) => Math.round(n * 100) / 100;
  return { items: lines, subtotal: r(subtotal), discountTotal: r(discountTotal), taxTotal: r(taxTotal), total: r(subtotal - discountTotal + taxTotal) };
}
const p = priced(items);

const invoices = [
  { invoiceNumber: 'TEST-FTR-2026-0042', status: 'PARTIALLY_PAID', issueDate: '2026-11-04', dueDate: '2026-12-04', currency: 'TRY', ...p, amountPaid: 1000, customer: customers[0], notes: 'Siparişiniz için teşekkür ederiz.' },
  { invoiceNumber: 'TEST-FTR-2026-0041', status: 'PAID', issueDate: '2026-10-28', dueDate: '2026-11-11', currency: 'TRY', total: 2360, amountPaid: 2360, customer: customers[1] },
  { invoiceNumber: 'TEST-FTR-2026-0040', status: 'OVERDUE', issueDate: '2026-10-01', dueDate: '2026-10-31', currency: 'TRY', total: 1180.5, amountPaid: 0, customer: customers[2] },
  { invoiceNumber: 'TEST-INV-2026-0007', status: 'SENT', issueDate: '2026-10-20', dueDate: '2026-11-19', currency: 'EUR', total: 840, amountPaid: 0, customer: customers[3] },
  { invoiceNumber: 'TEST-FTR-2026-0039', status: 'DRAFT', issueDate: '2026-11-03', dueDate: '2026-12-03', currency: 'TRY', total: 590, amountPaid: 0, customer: customers[1] },
];

const quotes = [
  { quoteNumber: 'TEST-TKL-2026-0012', status: 'SENT', issueDate: '2026-11-02', validUntil: '2026-12-02', currency: 'TRY', ...p, customer: customers[0], notes: 'Teklif 30 gün geçerlidir.' },
  { quoteNumber: 'TEST-TKL-2026-0011', status: 'ACCEPTED', issueDate: '2026-10-15', validUntil: '2026-11-14', currency: 'TRY', total: 3540, customer: customers[1] },
  { quoteNumber: 'TEST-TKL-2026-0010', status: 'REJECTED', issueDate: '2026-10-01', validUntil: '2026-10-31', currency: 'EUR', total: 1200, customer: customers[3] },
];

const recurring = [
  { name: 'TEST- Aylık bakım', customer: customers[0], frequency: 'MONTHLY', nextRunDate: '2026-12-01', isActive: true, currency: 'TRY', items: [{ quantity: 1, unitPrice: 1500, discount: 0, taxRate: 20 }] },
  { name: 'TEST- Üç aylık danışmanlık', customer: customers[1], frequency: 'QUARTERLY', nextRunDate: '2027-01-15', isActive: true, currency: 'TRY', items: [{ quantity: 3, unitPrice: 2000, discount: 300, taxRate: 20 }] },
  { name: null, customer: customers[3], frequency: 'YEARLY', nextRunDate: '2027-03-01', isActive: false, currency: 'EUR', items: [{ quantity: 1, unitPrice: 900, discount: 0, taxRate: 0 }] },
];

const expenses = [
  { date: '2026-11-03', description: 'Kavanoz ve etiket alımı', category: 'Ambalaj', vendor: vendors[0], status: 'PAID', currency: 'TRY', amount: 2400, taxRate: 20, taxAmount: 400 },
  { date: '2026-11-01', description: 'Kasım ayı kargo faturası', category: 'Lojistik', vendor: vendors[1], status: 'UNPAID', currency: 'TRY', amount: 1180, taxRate: 20, taxAmount: 196.67 },
  { date: '2026-10-25', description: 'Dükkân kirası — Ekim', category: 'Kira', vendor: null, status: 'PAID', currency: 'TRY', amount: 12000, taxRate: null, taxAmount: null },
  { date: '2026-10-18', description: 'Fuar katılım ücreti (Köln)', category: 'Pazarlama', vendor: null, status: 'PAID', currency: 'EUR', amount: 450, taxRate: null, taxAmount: null },
];
const income = [
  { date: '2026-11-02', description: 'Şarküteri toptan satış', category: 'Satış', customer: customers[1], status: 'RECEIVED', currency: 'TRY', amount: 2360 },
  { date: '2026-10-30', description: 'Pazar yeri satışı (İzmir)', category: 'Satış', customer: null, status: 'RECEIVED', currency: 'TRY', amount: 840.75 },
  { date: '2026-11-10', description: 'Beklenen avans ödemesi', category: 'Avans', customer: customers[0], status: 'EXPECTED', currency: 'TRY', amount: 1500 },
];
const payments = [
  { paymentDate: '2026-11-04', invoiceId: 'i1', invoice: { invoiceNumber: 'TEST-FTR-2026-0042', customer: customers[0] }, paymentMethod: 'bank_transfer', reference: 'EFT-1042', currency: 'TRY', amount: 1000 },
  { paymentDate: '2026-11-01', invoiceId: 'i2', invoice: { invoiceNumber: 'TEST-FTR-2026-0041', customer: customers[1] }, paymentMethod: 'cash', reference: '', currency: 'TRY', amount: 2360 },
  { paymentDate: '2026-11-03', invoiceId: null, expense: { description: 'Kavanoz ve etiket alımı', vendor: vendors[0] }, paymentMethod: 'credit_card', reference: 'POS-77', currency: 'TRY', amount: 2400 },
];
const cheques = [
  { dueDate: '2026-11-20', direction: 'RECEIVED', instrument: 'CHEQUE', chequeNumber: '0012345', bankName: 'Örnek Bankası', customer: customers[1], status: 'PORTFOLIO', currency: 'TRY', amount: 5000 },
  { dueDate: '2026-12-05', direction: 'RECEIVED', instrument: 'PROMISSORY_NOTE', chequeNumber: 'S-88', bankName: null, customer: customers[0], status: 'PRESENTED', currency: 'TRY', amount: 3250.5 },
  { dueDate: '2026-12-15', direction: 'ISSUED', instrument: 'CHEQUE', chequeNumber: '7700981', bankName: 'Deneme Katılım', vendor: vendors[0], status: 'OUTSTANDING', currency: 'TRY', amount: 8000 },
];
const bankAccount = { bankName: 'TEST- Örnek Bankası', accountName: 'Vadesiz TL' };
const bankTransactions = [
  { date: '2026-11-04', bankAccount, description: 'GELEN EFT AYŞE YILMAZ FTR-0042', reference: 'EFT-1042', direction: 'CREDIT', currency: 'TRY', amount: 1000, effectiveStatus: 'MATCHED' },
  { date: '2026-11-03', bankAccount, description: 'POS HARCAMA GÜNEŞ AMBALAJ', reference: 'POS-77', direction: 'DEBIT', currency: 'TRY', amount: 2400, effectiveStatus: 'MATCHED' },
  { date: '2026-11-02', bankAccount, description: 'HESAP İŞLETİM ÜCRETİ', reference: '', direction: 'DEBIT', currency: 'TRY', amount: 45, effectiveStatus: 'IGNORED' },
  { date: '2026-11-01', bankAccount, description: 'GELEN HAVALE — açıklamasız', reference: '', direction: 'CREDIT', currency: 'TRY', amount: 750, effectiveStatus: 'UNMATCHED' },
];
const bankAccounts = [
  { ...bankAccount, iban: 'TR00 0000 0000 0000 0000 0000 00', currency: 'TRY', lastBalance: 48250.4, lastBalanceAt: '2026-11-04', isActive: true },
  { bankName: 'TEST- Deneme Katılım', accountName: 'Döviz EUR', iban: 'TR11 1111 1111 1111 1111 1111 11', currency: 'EUR', lastBalance: 3120, lastBalanceAt: '2026-10-31', isActive: true },
  { bankName: 'TEST- Eski Banka', accountName: 'Kapalı hesap', accountNumber: '000123', currency: 'TRY', lastBalance: null, isActive: false },
];

const vat = buildVatReport({
  invoices: [{ currency: 'TRY', items }],
  expenses: expenses.filter((e) => e.taxRate !== null).map((e) => ({ currency: e.currency, amount: e.amount, taxRate: e.taxRate, taxAmount: e.taxAmount })),
} as any);
const report = buildReport({
  income: income.filter((i) => i.status === 'RECEIVED').map((i) => ({ currency: i.currency, date: i.date, amount: i.amount })),
  expenses: expenses.filter((e) => e.status === 'PAID').map((e) => ({ currency: e.currency, date: e.date, amount: e.amount })),
  expenseCategories: expenses.filter((e) => e.status === 'PAID').map((e) => ({ currency: e.currency, category: e.category, amount: e.amount })),
  unpaidExpenses: [{ currency: 'TRY', amount: 1180 }],
  invoices: [{ currency: 'TRY', total: 4130.5 + p.total, amountPaid: 3360 }, { currency: 'EUR', total: 840, amountPaid: 0 }],
  invoiceStatuses: invoices.map((i) => ({ status: i.status, count: 1 })),
  hasRecords: true,
  defaultCurrency: 'TRY',
  window: { startKey: '2026-10', endKey: '2026-11' },
} as any);

const lists: Array<{ file: string; kind: ListPdfKind; body: ListBody; filters?: Array<{ label: string; value: string }> }> = [
  { file: 'liste-faturalar', kind: 'invoices', body: invoicesBody(invoices, ctx) },
  { file: 'liste-faturalar-filtreli', kind: 'invoices', body: invoicesBody(invoices.filter((i) => i.status === 'PAID'), ctx), filters: [{ label: 'Durum', value: 'Ödendi' }] },
  { file: 'liste-teklifler', kind: 'quotes', body: quotesBody(quotes, ctx) },
  { file: 'liste-tekrarlayan-faturalar', kind: 'recurring', body: recurringBody(recurring, ctx) },
  { file: 'liste-musteriler', kind: 'customers', body: customersBody(customers, ctx) },
  { file: 'liste-tedarikciler', kind: 'vendors', body: vendorsBody(vendors, ctx) },
  { file: 'liste-giderler', kind: 'expenses', body: expensesBody(expenses, ctx) },
  { file: 'liste-gelirler', kind: 'income', body: incomeBody(income, ctx) },
  { file: 'liste-odemeler', kind: 'payments', body: paymentsBody(payments, ctx) },
  { file: 'liste-cek-senet', kind: 'cheques', body: chequesBody(cheques.filter((c) => c.direction === 'RECEIVED'), ctx), filters: [{ label: 'Yön', value: 'Alınan' }] },
  { file: 'liste-banka-mutabakati', kind: 'bank-transactions', body: bankTransactionsBody(bankTransactions, ctx), filters: [{ label: 'Hesap', value: 'TEST- Örnek Bankası – Vadesiz TL' }] },
  { file: 'liste-banka-hesaplari', kind: 'bank-accounts', body: bankAccountsBody(bankAccounts, ctx) },
  { file: 'rapor-kdv', kind: 'vat', body: vatBody(vat, ctx), filters: [{ label: 'Dönem', value: '01.11.2026 – 30.11.2026' }] },
  { file: 'rapor-finans', kind: 'reports', body: reportsBody(report, ctx) },
];

async function main() {
  const written: string[] = [];
  const save = (name: string, bytes: Uint8Array) => {
    const file = path.join(outDir, `${name}.pdf`);
    writeFileSync(file, bytes);
    written.push(`${name}.pdf (${bytes.length} bytes)`);
  };

  save('fatura-proforma', await renderInvoicePdf(invoices[0], company, createdAt));
  save('teklif', await renderQuotePdf(quotes[0], company, createdAt));

  const ledger = buildStatement({
    movements: [
      { id: '1', kind: 'invoice', date: '2026-10-01', currency: 'TRY', reference: 'TEST-FTR-2026-0040', debit: 1180.5 },
      { id: '2', kind: 'invoice', date: '2026-11-04', currency: 'TRY', reference: 'TEST-FTR-2026-0042', debit: p.total },
      { id: '3', kind: 'payment', date: '2026-11-04', currency: 'TRY', reference: 'bank_transfer', description: 'EFT-1042', credit: 1000 },
    ],
    defaultCurrency: 'TRY',
  });
  save('ekstre-musteri', await renderStatementPdf({
    locale: 'tr', party: customers[0], company,
    sections: ledger.currencies.map((c) => ledger.byCurrency[c]), issuedOn: createdAt,
  }));
  const vendorLedger = buildStatement({
    movements: [
      { id: '1', kind: 'expense', date: '2026-11-03', currency: 'TRY', reference: 'Kavanoz ve etiket alımı', debit: 2400 },
      { id: '2', kind: 'payment', date: '2026-11-03', currency: 'TRY', reference: 'credit_card', description: 'POS-77', credit: 2400 },
    ],
    defaultCurrency: 'TRY',
  });
  save('ekstre-tedarikci', await renderStatementPdf({
    locale: 'tr', party: vendors[0], company,
    sections: vendorLedger.currencies.map((c) => vendorLedger.byCurrency[c]), issuedOn: createdAt,
  }));

  for (const list of lists) {
    save(list.file, await renderListPdf({
      kind: list.kind, locale: 'tr', company, filters: list.filters ?? [], body: list.body, generatedAt: createdAt,
    }));
  }
  console.log(`wrote ${written.length} files to ${outDir}`);
  for (const w of written) console.log(`  ${w}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

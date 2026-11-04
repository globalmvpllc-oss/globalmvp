/**
 * Writes a sample Turkish invoice PDF with made-up data, for visual review:
 *
 *   npx tsx scripts/sample-invoice-pdf.ts ../docs/ornek-fatura-tr.pdf
 *
 * No database, no network. Every name and number below is fictional.
 */
import { writeFileSync } from 'fs';
import { renderInvoicePdf } from '../lib/pdf/invoice-pdf';

const out = process.argv[2] ?? 'ornek-fatura-tr.pdf';

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

const items = [
  { description: 'Şeftali reçeli (12 kavanoz, ılık depoda saklanır)', quantity: 12, unitPrice: 85, discount: 0, taxRate: 1, taxLabel: 'KDV' },
  { description: 'Danışmanlık hizmeti — Ağustos ayı', quantity: 1, unitPrice: 4500, discount: 250, taxRate: 20, taxLabel: 'KDV' },
  { description: 'Kargo ve ambalaj (İzmir şubesine gönderim)', quantity: 2, unitPrice: 150, discount: 0, taxRate: 20, taxLabel: 'KDV' },
  { description: 'Kitap: “Göğüs Kafesi” (KDV %10 örneği)', quantity: 3, unitPrice: 120, discount: 0, taxRate: 10, taxLabel: 'KDV' },
];

let subtotal = 0;
let discountTotal = 0;
let taxTotal = 0;
const lines = items.map((item) => {
  const base = item.quantity * item.unitPrice;
  const taxable = base - item.discount;
  const tax = (taxable * item.taxRate) / 100;
  subtotal += base;
  discountTotal += item.discount;
  taxTotal += tax;
  return { ...item, amount: Math.round((taxable + tax) * 100) / 100 };
});

const invoice = {
  invoiceNumber: 'TEST-FTR-2026-0042',
  issueDate: '2026-11-04',
  dueDate: '2026-12-04',
  currency: 'TRY',
  subtotal,
  discountTotal,
  taxTotal: Math.round(taxTotal * 100) / 100,
  total: Math.round((subtotal - discountTotal + taxTotal) * 100) / 100,
  amountPaid: 1000,
  notes: 'Şubat ayı siparişleriniz için teşekkür ederiz. Sorularınız için çağrı merkezimizi arayabilirsiniz: İş günleri 09:00–18:00.',
  customer: {
    name: 'TEST- Ayşe Yılmaz',
    companyName: 'TEST- Yılmaz Pastacılık',
    email: 'ayse@ornek.test',
    address: 'Gül Caddesi No: 5',
    city: 'İzmir',
    postalCode: '35210',
    country: 'TR',
    taxId: '12345678901',
    taxOffice: 'Konak',
  },
  items: lines,
};

renderInvoicePdf(invoice, company, new Date('2026-11-04T09:00:00Z')).then((bytes) => {
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  TR_VAT_RATES,
  companyCreateDefaults,
  displayTaxLabel,
  documentLocaleFor,
  isValidTrTaxId,
  showsInformationalNotice,
  taxLabelForCountry,
  trTaxIdKind,
  trTaxIdRuleApplies,
} from '@/lib/tr-tax';
import { checkPartyTaxId } from '@/lib/party-tax';
import {
  calendarReminderDue,
  daysOverdue,
  reminderDue,
  shouldMarkOverdue,
  startOfUtcDay,
} from '@/lib/cron/rules';
import { isAuthorizedCron } from '@/lib/cron/auth';
import { renderInvoiceHtml } from '@/lib/invoice-templates';
import { calendarReminderEmail, invoiceEmail, paymentReminderEmail } from '@/lib/email/templates';
import { canTransition, deriveStatusFromPayments } from '@/lib/invoice-status';
import { customerSchema, companySchema, vendorSchema } from '@/lib/validation';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

// ---------------------------------------------------------------------------
describe('KDV rates and company defaults', () => {
  it('offers exactly 0 / 1 / 10 / 20', () => {
    expect([...TR_VAT_RATES]).toEqual([0, 1, 10, 20]);
  });

  it('a Turkish company starts on TRY and 20%', () => {
    expect(companyCreateDefaults({ country: 'TR' })).toEqual({ defaultCurrency: 'TRY', defaultTaxRate: 20 });
  });

  it('keeps an explicit choice', () => {
    expect(companyCreateDefaults({ country: 'TR', defaultCurrency: 'EUR', defaultTaxRate: 10 })).toEqual({
      defaultCurrency: 'EUR',
      defaultTaxRate: 10,
    });
  });

  it('other countries keep the old defaults', () => {
    expect(companyCreateDefaults({ country: 'US' })).toEqual({ defaultCurrency: 'USD', defaultTaxRate: 0 });
    expect(companyCreateDefaults({})).toEqual({ defaultCurrency: 'USD', defaultTaxRate: 0 });
  });

  it('labels lines KDV for Turkey and VAT elsewhere', () => {
    expect(taxLabelForCountry('TR')).toBe('KDV');
    expect(taxLabelForCountry('DE')).toBe('VAT');
  });

  it('shows stored VAT as KDV to a Turkish reader, custom labels as typed', () => {
    expect(displayTaxLabel('VAT', 'tr')).toBe('KDV');
    expect(displayTaxLabel('VAT', 'en')).toBe('VAT');
    expect(displayTaxLabel('ÖTV', 'tr')).toBe('ÖTV');
  });

  it('the company schema accepts the reminder switch', () => {
    const parsed = companySchema.safeParse({ name: 'X', paymentRemindersEnabled: true });
    expect(parsed.success && parsed.data.paymentRemindersEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('VKN / TCKN', () => {
  it('accepts 10 and 11 digits, with spaces or dashes', () => {
    expect(isValidTrTaxId('1234567890')).toBe(true);
    expect(isValidTrTaxId('123 456 789 01')).toBe(true);
    expect(isValidTrTaxId('123-456-7890')).toBe(true);
  });

  it('refuses other lengths and letters', () => {
    for (const bad of ['123456789', '123456789012', 'TR12345678', '12345abcde']) {
      expect(isValidTrTaxId(bad), bad).toBe(false);
    }
  });

  it('tells VKN from TCKN', () => {
    expect(trTaxIdKind('1234567890')).toBe('VKN');
    expect(trTaxIdKind('12345678901')).toBe('TCKN');
    expect(trTaxIdKind('DE123')).toBeNull();
  });

  it('applies to Turkish parties, and to blank-country parties of a Turkish business', () => {
    expect(trTaxIdRuleApplies('TR', 'US')).toBe(true);
    expect(trTaxIdRuleApplies('', 'TR')).toBe(true);
    expect(trTaxIdRuleApplies(undefined, 'TR')).toBe(true);
    expect(trTaxIdRuleApplies('DE', 'TR')).toBe(false);
    expect(trTaxIdRuleApplies(undefined, 'US')).toBe(false);
  });

  it('the API check refuses a bad Turkish number with a code, tidies a good one', () => {
    const bad = checkPartyTaxId('12345', 'TR', 'TR');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.code).toBe('TAX_ID_INVALID');

    const good = checkPartyTaxId('123 456 7890', 'TR', 'TR');
    expect(good).toEqual({ ok: true, taxId: '1234567890' });
  });

  it('leaves foreign VAT numbers and empty values alone', () => {
    expect(checkPartyTaxId('DE123456789', 'DE', 'TR')).toEqual({ ok: true, taxId: 'DE123456789' });
    expect(checkPartyTaxId('', 'TR', 'TR')).toEqual({ ok: true, taxId: '' });
    expect(checkPartyTaxId(undefined, 'TR', 'TR')).toEqual({ ok: true, taxId: undefined });
  });

  it('customer and vendor schemas carry tax office; customer carries language', () => {
    const c = customerSchema.safeParse({ name: 'A', taxOffice: 'Kadıköy', language: 'tr' });
    expect(c.success).toBe(true);
    expect(customerSchema.safeParse({ name: 'A', language: 'de' }).success).toBe(false);
    expect(vendorSchema.safeParse({ name: 'B', taxOffice: 'Çankaya' }).success).toBe(true);
  });

  it('every customer and vendor write route runs the check', () => {
    for (const file of [
      'app/api/customers/route.ts',
      'app/api/customers/[id]/route.ts',
      'app/api/vendors/route.ts',
      'app/api/vendors/[id]/route.ts',
    ]) {
      expect(src(file), file).toContain('checkPartyTaxId(');
    }
  });

  it('the vendor edit route is scoped to the session company', () => {
    const route = src('app/api/vendors/[id]/route.ts');
    expect(route).toContain('export async function PUT');
    expect(route).toContain('where: { id: params.id, companyId }');
    expect(route).not.toContain('export async function DELETE');
  });
});

// ---------------------------------------------------------------------------
describe('document language', () => {
  it('customer language wins, then customer country, then company country', () => {
    expect(documentLocaleFor({ language: 'en', country: 'TR' }, { country: 'TR' })).toBe('en');
    expect(documentLocaleFor({ country: 'TR' }, { country: 'US' })).toBe('tr');
    expect(documentLocaleFor({ country: 'DE' }, { country: 'TR' })).toBe('en');
    expect(documentLocaleFor({}, { country: 'TR' })).toBe('tr');
    expect(documentLocaleFor(null, null)).toBe('en');
  });

  it('the notice is for Turkish companies without an e-document', () => {
    expect(showsInformationalNotice({}, { country: 'TR' })).toBe(true);
    expect(showsInformationalNotice({ eDocumentUuid: 'abc' }, { country: 'TR' })).toBe(false);
    expect(showsInformationalNotice({}, { country: 'US' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
const trInvoice = {
  invoiceNumber: 'FTR-0001',
  issueDate: '2026-11-04',
  dueDate: '2026-12-04',
  currency: 'TRY',
  subtotal: 100,
  discountTotal: 0,
  taxTotal: 20,
  total: 120,
  customer: {
    name: 'Ayşe Yılmaz',
    email: 'ayse@example.test',
    taxId: '12345678901',
    taxOffice: 'Kadıköy',
    country: 'TR',
  },
  items: [{ description: 'Danışmanlık', quantity: 1, unitPrice: 100, taxRate: 20, amount: 120 }],
};
const trCompany = { name: 'Örnek Ltd', country: 'TR', taxNumber: '1234567890', taxOffice: 'Beşiktaş' };

describe('invoice PDF in Turkish', () => {
  for (const template of ['classic', 'modern', 'minimal']) {
    it(`${template}: Turkish labels, KDV, customer TCKN and tax office, the notice`, () => {
      const html = renderInvoiceHtml(trInvoice, { ...trCompany, invoiceTemplate: template });
      expect(html).toContain('KDV');
      expect(html).not.toContain('<span>Tax</span>');
      expect(html).toContain('Ara toplam');
      expect(html).toContain('TCKN: 12345678901');
      expect(html).toContain('Vergi dairesi: Kadıköy');
      expect(html).toContain('Bu belge bilgilendirme amaçlıdır; yasal e-Arşiv/e-Fatura yerine geçmez.');
      expect(html).toContain('Kasım');
    });
  }

  it('an English customer of a Turkish company gets English labels and the notice in English', () => {
    const html = renderInvoiceHtml({ ...trInvoice, customer: { ...trInvoice.customer, language: 'en' } }, trCompany);
    expect(html).toContain('INVOICE');
    expect(html).toContain('does not replace a legal e-Arşiv or e-Fatura');
  });

  it('a non-Turkish company prints no notice', () => {
    const html = renderInvoiceHtml({ ...trInvoice, customer: { name: 'Bob' } }, { name: 'Acme', country: 'US' });
    expect(html).not.toContain('e-Arşiv');
    expect(html).toContain('INVOICE');
  });

  it('customer tax details are escaped', () => {
    const html = renderInvoiceHtml(
      { ...trInvoice, customer: { ...trInvoice.customer, taxOffice: '<script>x</script>' } },
      trCompany
    );
    expect(html).not.toContain('<script>x</script>');
  });
});

// ---------------------------------------------------------------------------
describe('overdue rules', () => {
  const now = new Date('2026-11-10T04:00:00Z');

  it('counts days from the UTC calendar day', () => {
    expect(startOfUtcDay(now).toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(daysOverdue('2026-11-09T00:00:00Z', now)).toBe(1);
    expect(daysOverdue('2026-11-10T00:00:00Z', now)).toBe(0);
    expect(daysOverdue('2026-11-03T00:00:00Z', now)).toBe(7);
  });

  it('marks SENT / VIEWED / PARTIALLY_PAID past due and unpaid', () => {
    for (const status of ['SENT', 'VIEWED', 'PARTIALLY_PAID']) {
      expect(shouldMarkOverdue({ status, dueDate: '2026-11-09', total: 100, amountPaid: 40 }, now), status).toBe(true);
    }
  });

  it('leaves the due day itself, paid, draft and cancelled invoices alone', () => {
    expect(shouldMarkOverdue({ status: 'SENT', dueDate: '2026-11-10', total: 100, amountPaid: 0 }, now)).toBe(false);
    expect(shouldMarkOverdue({ status: 'SENT', dueDate: '2026-11-01', total: 100, amountPaid: 100 }, now)).toBe(false);
    for (const status of ['DRAFT', 'CANCELLED', 'PAID', 'OVERDUE']) {
      expect(shouldMarkOverdue({ status, dueDate: '2026-11-01', total: 100, amountPaid: 0 }, now), status).toBe(false);
    }
  });

  it('a partly paid invoice may move to OVERDUE, and a part payment keeps it overdue', () => {
    expect(canTransition('PARTIALLY_PAID', 'OVERDUE')).toBe(true);
    expect(deriveStatusFromPayments('OVERDUE', 40, 100)).toBe('OVERDUE');
    expect(deriveStatusFromPayments('OVERDUE', 100, 100)).toBe('PAID');
    expect(deriveStatusFromPayments('SENT', 40, 100)).toBe('PARTIALLY_PAID');
  });

  it('the database sweep compares amountPaid with total and never writes amountPaid', () => {
    const jobs = src('lib/cron/jobs.ts');
    expect(jobs).toContain('amountPaid: { lt: prisma.invoice.fields.total }');
    expect(jobs).toMatch(/data: \{ status: 'OVERDUE' \}/);
  });
});

describe('payment reminder rules', () => {
  const now = new Date('2026-11-10T04:00:00Z');
  const base = { status: 'OVERDUE', total: 100, amountPaid: 0 };

  it('first reminder 1–6 days late, once', () => {
    expect(reminderDue({ ...base, dueDate: '2026-11-09' }, now)).toBe('overdue');
    expect(reminderDue({ ...base, dueDate: '2026-11-04' }, now)).toBe('overdue');
    expect(reminderDue({ ...base, dueDate: '2026-11-09', overdueReminderSentAt: new Date() }, now)).toBeNull();
  });

  it('follow-up 7 days after the due date, once', () => {
    expect(reminderDue({ ...base, dueDate: '2026-11-03' }, now)).toBe('followup');
    expect(reminderDue({ ...base, dueDate: '2026-11-03', followUpReminderSentAt: new Date() }, now)).toBeNull();
  });

  it('never emails an old backlog, a paid invoice or a non-overdue one', () => {
    expect(reminderDue({ ...base, dueDate: '2026-10-01' }, now)).toBeNull();
    expect(reminderDue({ ...base, dueDate: '2026-11-09', amountPaid: 100 }, now)).toBeNull();
    expect(reminderDue({ ...base, status: 'SENT', dueDate: '2026-11-09' }, now)).toBeNull();
  });

  it('is off by default and each email is claimed before sending', () => {
    expect(src('prisma/schema.prisma')).toContain('paymentRemindersEnabled  Boolean @default(false)');
    const jobs = src('lib/cron/jobs.ts');
    expect(jobs).toContain('company: { paymentRemindersEnabled: true }');
    expect(jobs).toContain("[stamp]: null");
  });
});

describe('calendar reminder rules', () => {
  const now = new Date('2026-11-10T04:00:00Z');
  it('sends on the reminder day (and catches up one missed day)', () => {
    expect(calendarReminderDue({ reminderAt: '2026-11-10T06:00:00Z' }, now)).toBe(true);
    expect(calendarReminderDue({ reminderAt: '2026-11-09T09:00:00Z' }, now)).toBe(true);
  });
  it('not before, not twice, not for done or cancelled entries', () => {
    expect(calendarReminderDue({ reminderAt: '2026-11-11T06:00:00Z' }, now)).toBe(false);
    expect(calendarReminderDue({ reminderAt: '2026-11-07T06:00:00Z' }, now)).toBe(false);
    expect(calendarReminderDue({ reminderAt: '2026-11-10T06:00:00Z', reminderSentAt: new Date() }, now)).toBe(false);
    expect(calendarReminderDue({ reminderAt: '2026-11-10T06:00:00Z', status: 'CANCELLED' }, now)).toBe(false);
    expect(calendarReminderDue({ reminderAt: null }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('cron protection', () => {
  const secret = 'a-long-random-cron-secret-value';
  it('accepts only the exact bearer secret', () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
  it('fails closed without a (long enough) secret', () => {
    expect(isAuthorizedCron('Bearer ', undefined)).toBe(false);
    expect(isAuthorizedCron('Bearer short', 'short')).toBe(false);
  });
  it('is scheduled daily and reachable without a session', () => {
    const vercel = JSON.parse(src('vercel.json'));
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily', schedule: '0 4 * * *' }]);
    expect(src('middleware.ts')).toContain("pathname.startsWith('/api/cron/')");
    expect(src('app/api/cron/daily/route.ts')).toContain('isAuthorizedCron(');
  });
});

// ---------------------------------------------------------------------------
describe('emails', () => {
  const input = {
    companyName: 'Örnek Ltd',
    customerName: 'Ayşe',
    invoiceNumber: 'FTR-0001',
    amountDue: 1250,
    currency: 'TRY',
    dueDate: '2026-12-04',
  };

  it('invoice email in Turkish and English', () => {
    const tr = invoiceEmail({ ...input, locale: 'tr' });
    expect(tr.subject).toBe('Örnek Ltd - FTR-0001 numaralı fatura');
    expect(tr.text).toContain('Merhaba Ayşe,');
    expect(tr.text).toContain('4 Aralık 2026');
    const en = invoiceEmail({ ...input, locale: 'en' });
    expect(en.subject).toBe('Invoice FTR-0001 from Örnek Ltd');
  });

  it('reminders are short and polite, with the remaining amount', () => {
    const first = paymentReminderEmail({ ...input, locale: 'tr', kind: 'overdue' });
    expect(first.subject).toContain('Nazik hatırlatma');
    expect(first.text).toContain('Kalan tutar');
    const follow = paymentReminderEmail({ ...input, locale: 'en', kind: 'followup' });
    expect(follow.text).toContain('7 days past its due date');
  });

  it('escapes values in the HTML part', () => {
    const mail = invoiceEmail({ ...input, customerName: '<b>x</b>', locale: 'en' });
    expect(mail.html).not.toContain('<b>x</b>');
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('calendar reminder links to the calendar', () => {
    const mail = calendarReminderEmail({
      locale: 'tr',
      userName: 'Mehmet',
      title: 'Vergi ödemesi',
      startAt: '2026-11-10',
      calendarUrl: 'https://corpcontrol.net/calendar',
    });
    expect(mail.subject).toBe('Hatırlatma: Vergi ödemesi');
    expect(mail.html).toContain('https://corpcontrol.net/calendar');
  });
});

// ---------------------------------------------------------------------------
describe('send invoice by email (route contract)', () => {
  const route = src('app/api/invoices/[id]/send/route.ts');

  it('is scoped to the session company and sends only to the stored address', () => {
    expect(route).toContain('where: { id: params.id, companyId }');
    expect(route).toContain('invoice.customer?.email');
    expect(route).not.toMatch(/request\.json\(\)/);
  });

  it('never sends without the PDF and records the send', () => {
    expect(route).toContain("code: 'PDF_FAILED'");
    expect(route.indexOf('renderInvoicePdf(')).toBeLessThan(route.indexOf('sendMail('));
    expect(route).toContain("action: 'invoice.emailed'");
    expect(route).toContain("status: 'DRAFT' },\n        data: { status: 'SENT' }");
  });
});

// ---------------------------------------------------------------------------
describe('landing page and wording', () => {
  it('lists cheques, suppliers and bank import among the features', () => {
    const grid = src('components/marketing/feature-grid.tsx');
    for (const key of ['chequesTitle', 'vendorsTitle', 'bankingTitle']) expect(grid).toContain(key);
  });

  it('Turkish copy does not say "fatura kesin" and makes no e-Fatura claim yet', () => {
    const tr = src('lib/i18n/tr.ts');
    expect(tr).not.toMatch(/fatura kes/i);
    const landing = tr
      .split('\n')
      .filter((line) => /'landing\.|'pricingPage\.|'meta\./.test(line))
      .join('\n');
    expect(landing).not.toMatch(/e-?fatura|e-?arşiv/i);
  });

  it('page titles follow the visitor language', () => {
    expect(src('app/layout.tsx')).toContain('export function generateMetadata');
    for (const page of ['pricing', 'contact', 'privacy', 'terms', 'refund', 'invoicing', 'finance', 'expense-tracking']) {
      expect(src(`app/${page}/page.tsx`), page).toContain('localizedPageMetadata(');
    }
  });
});

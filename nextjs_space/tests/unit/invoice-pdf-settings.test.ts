import { describe, it, expect } from 'vitest';
import { generateInvoiceHtml } from '@/lib/invoice-html';

/**
 * These settings could all be saved before this change, and none of them
 * reached the document — the Settings screen was making a promise the PDF did
 * not keep. Each test drives the generator directly.
 */

const invoice = {
  invoiceNumber: 'INV-0007',
  issueDate: '2026-01-01',
  dueDate: '2026-01-31',
  currency: 'USD',
  subtotal: 100,
  taxTotal: 20,
  discountTotal: 0,
  total: 120,
  notes: 'Thanks for your business',
  items: [{ description: 'Consulting', quantity: 1, unitPrice: 100, taxRate: 20, amount: 100 }],
  customer: { name: 'Acme Ltd', companyName: 'Acme', email: 'billing@acme.test' },
};

const LOGO = 'data:image/png;base64,AAAA';

describe('invoiceShowLogo', () => {
  it('omits the logo when the setting is off', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', invoiceShowLogo: false }, LOGO);
    expect(html).not.toContain(LOGO);
  });

  it('shows the logo when the setting is on', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', invoiceShowLogo: true }, LOGO);
    expect(html).toContain(LOGO);
  });

  it('shows the logo when the setting has never been set', () => {
    // Existing companies must keep today's appearance.
    const html = generateInvoiceHtml(invoice, { name: 'My Co' }, LOGO);
    expect(html).toContain(LOGO);
  });
});

describe('invoiceShowTax', () => {
  it('hides the tax row when the setting is off', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', invoiceShowTax: false });
    expect(html).not.toContain('<span>Tax</span>');
  });

  it('shows the tax row by default', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co' });
    expect(html).toContain('<span>Tax</span>');
  });

  it('does not change the total when the tax row is hidden', () => {
    // Hiding a line is presentation; the arithmetic must be untouched.
    const shown = generateInvoiceHtml(invoice, { name: 'My Co', invoiceShowTax: true });
    const hidden = generateInvoiceHtml(invoice, { name: 'My Co', invoiceShowTax: false });
    expect(shown).toContain('120.00');
    expect(hidden).toContain('120.00');
  });

  it('omits the tax row anyway when there is no tax', () => {
    const noTax = { ...invoice, taxTotal: 0 };
    expect(generateInvoiceHtml(noTax, { name: 'My Co' })).not.toContain('<span>Tax</span>');
  });
});

describe('invoiceFooter', () => {
  it('prints the configured footer', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', invoiceFooter: 'Registered in Istanbul' });
    expect(html).toContain('Registered in Istanbul');
  });

  it('falls back to the company name when no footer is set', () => {
    expect(generateInvoiceHtml(invoice, { name: 'My Co' })).toContain('My Co');
  });
});

describe('payment and bank instructions', () => {
  it('prints payment instructions', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', paymentInstructions: 'Pay within 14 days' });
    expect(html).toContain('Payment instructions:');
    expect(html).toContain('Pay within 14 days');
  });

  it('prints bank transfer details', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', bankTransferInstructions: 'IBAN TR11 2222' });
    expect(html).toContain('Bank transfer details:');
    expect(html).toContain('IBAN TR11 2222');
  });

  it('omits both blocks when unset', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co' });
    expect(html).not.toContain('Payment instructions:');
    expect(html).not.toContain('Bank transfer details:');
  });

  it('escapes instruction text rather than injecting markup', () => {
    const html = generateInvoiceHtml(invoice, {
      name: 'My Co',
      paymentInstructions: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('primaryColor', () => {
  it('uses a valid hex brand colour', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', primaryColor: '#112233' });
    expect(html).toContain('#112233');
  });

  it('falls back to the product default when unset', () => {
    expect(generateInvoiceHtml(invoice, { name: 'My Co' })).toContain('#7C3AED');
  });

  it.each(['red', 'javascript:alert(1)', '#12', 'expression(alert(1))'])(
    'refuses to interpolate %s into the stylesheet',
    (value) => {
      const html = generateInvoiceHtml(invoice, { name: 'My Co', primaryColor: value });
      expect(html).toContain('#7C3AED');
      expect(html).not.toContain(`color: ${value}`);
    }
  );
});

describe('country is printed by name', () => {
  it('renders the stored code as a full country name', () => {
    const html = generateInvoiceHtml(invoice, { name: 'My Co', country: 'TR' });
    expect(html).toContain('Turkey');
  });
});

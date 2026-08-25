import { describe, it, expect } from 'vitest';
import { generateInvoiceHtml } from '@/lib/invoice-html';
import {
  resolveTemplateId,
  INVOICE_TEMPLATE_IDS,
  DEFAULT_TEMPLATE,
  safeBrandColor,
  safeLogoSrc,
  buildInvoiceView,
  DEFAULT_BRAND_COLOR,
} from '@/lib/invoice-templates';

/**
 * The Settings screen offered classic / modern / minimal long before the
 * renderer read the value. These cover the registry, and then run the same
 * expectations against every template so a new layout cannot quietly drop a
 * setting or an escape.
 */

const invoice = {
  invoiceNumber: 'INV-0007',
  issueDate: '2026-01-01',
  dueDate: '2026-01-31',
  currency: 'USD',
  subtotal: 100,
  taxTotal: 20,
  discountTotal: 5,
  total: 115,
  notes: 'Thanks for your business',
  items: [
    { description: 'Consulting', quantity: 2, unitPrice: 50, taxRate: 20, amount: 100 },
  ],
  customer: { name: 'Acme Ltd', companyName: 'Acme Holdings', email: 'billing@acme.test' },
};

const LOGO = 'data:image/png;base64,AAAA';

/** Renders through the public entry point with a given template id. */
const render = (template: string | undefined, company: Record<string, unknown> = {}, logo = LOGO) =>
  generateInvoiceHtml(invoice, { name: 'My Co', invoiceTemplate: template, ...company }, logo);

describe('resolveTemplateId', () => {
  it.each(['classic', 'modern', 'minimal'])('accepts %s', (id) => {
    expect(resolveTemplateId(id)).toBe(id);
  });

  it('normalises case and stray whitespace', () => {
    expect(resolveTemplateId('  Modern ')).toBe('modern');
  });

  it.each([undefined, null, '', 'sparkly', 42, {}, [], '__proto__', 'constructor'])(
    'falls back to the default for %s',
    (value) => {
      expect(resolveTemplateId(value)).toBe(DEFAULT_TEMPLATE);
    }
  );

  it('defaults to classic, so existing invoices are unchanged', () => {
    expect(DEFAULT_TEMPLATE).toBe('classic');
  });

  it('exposes exactly the ids the settings screen offers', () => {
    expect(INVOICE_TEMPLATE_IDS.sort()).toEqual(['classic', 'minimal', 'modern']);
  });
});

describe('each template renders a complete document', () => {
  it.each(INVOICE_TEMPLATE_IDS)('%s produces a full HTML document', (id) => {
    const html = render(id);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s renders company, customer and invoice identity', (id) => {
    const html = render(id);
    expect(html).toContain('My Co');
    expect(html).toContain('Acme Ltd');
    expect(html).toContain('Acme Holdings');
    expect(html).toContain('billing@acme.test');
    expect(html).toContain('INV-0007');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s renders the line items', (id) => {
    const html = render(id);
    expect(html).toContain('Consulting');
    expect(html).toContain('$50.00');
  });

  it('an unknown template renders identically to classic', () => {
    expect(render('does-not-exist')).toBe(render('classic'));
  });

  it('templates are genuinely different documents, not the same markup', () => {
    const rendered = INVOICE_TEMPLATE_IDS.map((id) => render(id));
    expect(new Set(rendered).size).toBe(INVOICE_TEMPLATE_IDS.length);
  });
});

describe('totals are identical in every template', () => {
  it('renders the same figures regardless of layout', () => {
    for (const id of INVOICE_TEMPLATE_IDS) {
      const html = render(id);
      expect(html).toContain('$100.00'); // subtotal
      expect(html).toContain('$5.00'); // discount
      expect(html).toContain('$20.00'); // tax
      expect(html).toContain('$115.00'); // total
    }
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s formats a non-USD currency symbol', (id) => {
    const html = generateInvoiceHtml(
      { ...invoice, currency: 'TRY' },
      { name: 'My Co', invoiceTemplate: id },
      LOGO
    );
    expect(html).toContain('₺115.00');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s omits the discount row when there is none', (id) => {
    const html = generateInvoiceHtml(
      { ...invoice, discountTotal: 0 },
      { name: 'My Co', invoiceTemplate: id },
      LOGO
    );
    expect(html).not.toContain('Discount');
  });
});

describe('invoiceShowLogo applies in every template', () => {
  it.each(INVOICE_TEMPLATE_IDS)('%s hides the logo when the setting is off', (id) => {
    expect(render(id, { invoiceShowLogo: false })).not.toContain(LOGO);
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s shows the logo when the setting is on', (id) => {
    expect(render(id, { invoiceShowLogo: true })).toContain(LOGO);
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s shows the logo when the setting is unset', (id) => {
    expect(render(id, {})).toContain(LOGO);
  });
});

describe('invoiceShowTax applies in every template', () => {
  it.each(INVOICE_TEMPLATE_IDS)('%s hides the tax total row when the setting is off', (id) => {
    // The per-item "Tax" column header is a different thing from the tax total
    // row, so this asserts on the totals markup specifically.
    const html = render(id, { invoiceShowTax: false });
    expect(html).not.toContain('<span>Tax</span>');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s still shows the per-item tax column', (id) => {
    expect(render(id, { invoiceShowTax: false })).toContain('Tax</th>');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s keeps the total unchanged when tax is hidden', (id) => {
    // Hiding a row is presentation; the arithmetic must not move.
    expect(render(id, { invoiceShowTax: false })).toContain('$115.00');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s shows the tax row by default', (id) => {
    expect(render(id, {})).toContain('$20.00');
  });
});

describe('footer, notes and instructions apply in every template', () => {
  it.each(INVOICE_TEMPLATE_IDS)('%s prints a configured footer', (id) => {
    expect(render(id, { invoiceFooter: 'Registered in Istanbul' })).toContain('Registered in Istanbul');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s falls back to the company name as footer', (id) => {
    expect(render(id, {})).toContain('My Co');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s prints payment instructions', (id) => {
    expect(render(id, { paymentInstructions: 'Pay within 14 days' })).toContain('Pay within 14 days');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s prints bank transfer details', (id) => {
    expect(render(id, { bankTransferInstructions: 'IBAN TR11 2222' })).toContain('IBAN TR11 2222');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s omits instruction blocks when unset', (id) => {
    const html = render(id, {});
    expect(html).not.toContain('Payment instructions');
    expect(html).not.toContain('Bank transfer details');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s renders the country by name, not its code', (id) => {
    expect(render(id, { country: 'TR' })).toContain('Turkey');
  });
});

describe('brand colour is sanitised', () => {
  it('accepts a six-digit hex value', () => {
    expect(safeBrandColor('#112233')).toBe('#112233');
  });

  it.each(['red', '#12', '#1234567', 'expression(alert(1))', 'javascript:alert(1)', 42, null])(
    'rejects %s',
    (value) => {
      expect(safeBrandColor(value)).toBe(DEFAULT_BRAND_COLOR);
    }
  );

  it.each(INVOICE_TEMPLATE_IDS)('%s uses a valid brand colour', (id) => {
    expect(render(id, { primaryColor: '#112233' })).toContain('#112233');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s refuses to inject a CSS payload as a colour', (id) => {
    const payload = '#fff;} body { display:none } .x{';
    const html = render(id, { primaryColor: payload });
    expect(html).not.toContain('display:none');
    expect(html).toContain(DEFAULT_BRAND_COLOR);
  });
});

describe('logo source is sanitised', () => {
  it.each(['data:image/png;base64,AAAA', 'data:image/jpeg;base64,AA==', 'data:image/webp;base64,AA'])(
    'accepts %s',
    (value) => {
      expect(safeLogoSrc(value)).toBe(value);
    }
  );

  it.each([
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'https://evil.example.com/x.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA" onerror="alert(1)',
    42,
    null,
  ])('rejects %s', (value) => {
    expect(safeLogoSrc(value)).toBeNull();
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s drops an attribute-breaking logo value', (id) => {
    const html = generateInvoiceHtml(
      invoice,
      { name: 'My Co', invoiceTemplate: id },
      'data:image/png;base64,AAAA" onerror="alert(1)'
    );
    expect(html).not.toContain('onerror');
  });
});

describe('user-controlled content cannot inject markup', () => {
  const attack = '<script>alert(1)</script>';

  it.each(INVOICE_TEMPLATE_IDS)('%s escapes a line item description', (id) => {
    const html = generateInvoiceHtml(
      { ...invoice, items: [{ description: attack, quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 }] },
      { name: 'My Co', invoiceTemplate: id },
      LOGO
    );
    // This one was genuinely unescaped before the template split.
    expect(html).not.toContain(attack);
    expect(html).toContain('&lt;script&gt;');
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s escapes the customer name and email', (id) => {
    const html = generateInvoiceHtml(
      { ...invoice, customer: { name: attack, companyName: attack, email: attack } },
      { name: 'My Co', invoiceTemplate: id },
      LOGO
    );
    expect(html).not.toContain(attack);
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s escapes the invoice number and notes', (id) => {
    const html = generateInvoiceHtml(
      { ...invoice, invoiceNumber: attack, notes: attack },
      { name: 'My Co', invoiceTemplate: id },
      LOGO
    );
    expect(html).not.toContain(attack);
  });

  it.each(INVOICE_TEMPLATE_IDS)('%s escapes company-supplied text', (id) => {
    const html = render(id, {
      name: attack,
      invoiceFooter: attack,
      paymentInstructions: attack,
      bankTransferInstructions: attack,
    });
    expect(html).not.toContain(attack);
  });
});

describe('view model', () => {
  it('hides tax by nulling the field, so no template can show it by accident', () => {
    const view = buildInvoiceView(invoice, { invoiceShowTax: false });
    expect(view.tax).toBeNull();
  });

  it('hides the logo by nulling the source', () => {
    expect(buildInvoiceView(invoice, { invoiceShowLogo: false }, LOGO).logoSrc).toBeNull();
  });

  it('handles a missing invoice without throwing', () => {
    const view = buildInvoiceView(undefined, undefined, null);
    expect(view.total).toBe('$0.00');
    expect(view.items).toEqual([]);
  });
});

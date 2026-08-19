/**
 * Phase 1 Regression Test Suite — Integration Tests
 * Hits actual running dev server at localhost:3000
 * Covers: Auth, Multi-tenant, Payments, Validation, Currency, Status, PDF, Upload, Onboarding
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:3000';

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const cookies = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  const cookieStr = cookies.map((c: string) => c.split(';')[0]).join('; ');

  const body = new URLSearchParams({ csrfToken, email, password, json: 'true' });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieStr },
    body: body.toString(),
    redirect: 'manual',
  });
  const allCookies = [...cookies, ...(loginRes.headers.getSetCookie?.() ?? [])];
  return allCookies.map((c: string) => c.split(';')[0]).join('; ');
}

async function signup(email: string, password: string, name: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  return res.ok;
}

async function api(path: string, options: RequestInit & { cookies?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any ?? {}) };
  if (options.cookies) headers.Cookie = options.cookies;
  return fetch(`${BASE}${path}`, { ...options, headers, redirect: 'manual' });
}

let cookiesA = '';
let cookiesB = '';
let cookiesNoCompany = '';
let companyACustomerId = '';
let companyAInvoiceId = '';
let companyAExpenseId = '';
let companyAIncomeId = '';
let companyBCustomerId = '';
let companyBInvoiceId = '';
let companyBExpenseId = '';

const uniqueSuffix = Date.now();
const emailA = `testa${uniqueSuffix}@test.com`;
const emailB = `testb${uniqueSuffix}@test.com`;
const emailNoCompany = `testnc${uniqueSuffix}@test.com`;
const pass = 'TestPass123!';

beforeAll(async () => {
  await signup(emailA, pass, 'User A');
  await signup(emailB, pass, 'User B');
  await signup(emailNoCompany, pass, 'No Company User');

  cookiesA = await login(emailA, pass);
  cookiesB = await login(emailB, pass);
  cookiesNoCompany = await login(emailNoCompany, pass);

  const resA = await api('/api/company', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ name: 'Company A', defaultCurrency: 'USD' }) });
  expect(resA.status).toBeLessThan(300);

  const resB = await api('/api/company', { method: 'POST', cookies: cookiesB, body: JSON.stringify({ name: 'Company B', defaultCurrency: 'EUR' }) });
  expect(resB.status).toBeLessThan(300);

  const custA = await api('/api/customers', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ name: 'Customer Alpha' }) });
  companyACustomerId = (await custA.json()).id;

  const custB = await api('/api/customers', { method: 'POST', cookies: cookiesB, body: JSON.stringify({ name: 'Customer Beta' }) });
  companyBCustomerId = (await custB.json()).id;

  const invA = await api('/api/invoices', {
    method: 'POST', cookies: cookiesA,
    body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', currency: 'USD', items: [{ description: 'Service A', quantity: 1, unitPrice: 100 }] }),
  });
  companyAInvoiceId = (await invA.json()).id;
  await api(`/api/invoices/${companyAInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'SENT' }) });

  const invB = await api('/api/invoices', {
    method: 'POST', cookies: cookiesB,
    body: JSON.stringify({ customerId: companyBCustomerId, dueDate: '2027-01-01', currency: 'EUR', items: [{ description: 'Service B', quantity: 1, unitPrice: 200 }] }),
  });
  companyBInvoiceId = (await invB.json()).id;

  const expA = await api('/api/expenses', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: 'Expense A', amount: 50, currency: 'USD' }) });
  companyAExpenseId = (await expA.json()).id;

  const expB = await api('/api/expenses', { method: 'POST', cookies: cookiesB, body: JSON.stringify({ description: 'Expense B', amount: 75, currency: 'EUR' }) });
  companyBExpenseId = (await expB.json()).id;

  const incA = await api('/api/income', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: 'Income A', amount: 200, currency: 'USD' }) });
  companyAIncomeId = (await incA.json()).id;
}, 60000);

// ====================================================================
// Section 1: Multi-Tenant Security Tests
// ====================================================================
describe('Multi-Tenant Security (Section 1)', () => {
  it('A cannot GET B invoice', async () => {
    const res = await api(`/api/invoices/${companyBInvoiceId}`, { cookies: cookiesA });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot PUT B invoice', async () => {
    const res = await api(`/api/invoices/${companyBInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ notes: 'hacked' }) });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot DELETE B invoice', async () => {
    const res = await api(`/api/invoices/${companyBInvoiceId}`, { method: 'DELETE', cookies: cookiesA });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot GET B customer', async () => {
    const res = await api(`/api/customers/${companyBCustomerId}`, { cookies: cookiesA });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot PUT B customer', async () => {
    const res = await api(`/api/customers/${companyBCustomerId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ name: 'hacked' }) });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot DELETE B customer', async () => {
    const res = await api(`/api/customers/${companyBCustomerId}`, { method: 'DELETE', cookies: cookiesA });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot create invoice with B customer', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyBCustomerId, dueDate: '2027-01-01', items: [{ description: 'X', quantity: 1, unitPrice: 10 }] }),
    });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot create payment against B invoice', async () => {
    const res = await api('/api/payments', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ invoiceId: companyBInvoiceId, amount: 10, currency: 'USD' }),
    });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot create payment against B expense', async () => {
    const res = await api('/api/payments', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ expenseId: companyBExpenseId, amount: 10, currency: 'USD' }),
    });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot modify B income', async () => {
    const incB = await api('/api/income', { method: 'POST', cookies: cookiesB, body: JSON.stringify({ description: 'Income B', amount: 100, currency: 'EUR' }) });
    const bIncId = (await incB.json()).id;
    const res = await api('/api/income', { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ id: bIncId, description: 'hacked' }) });
    expect([403, 404]).toContain(res.status);
  });
  it('A cannot modify B expense', async () => {
    const res = await api('/api/expenses', { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ id: companyBExpenseId, description: 'hacked' }) });
    expect([403, 404]).toContain(res.status);
  });

  describe('User with NO company', () => {
    const endpoints: [string, string][] = [
      ['GET', '/api/dashboard'], ['GET', '/api/invoices'], ['GET', '/api/customers'],
      ['GET', '/api/payments'], ['GET', '/api/income'], ['GET', '/api/expenses'],
      ['GET', '/api/categories'], ['GET', '/api/vendors'],
      ['POST', '/api/generate-pdf'], ['POST', '/api/generate-pdf/status'], ['POST', '/api/upload/presigned'],
    ];
    for (const [method, path] of endpoints) {
      it(`${method} ${path} returns 403`, async () => {
        const res = await api(path, { method: method as any, cookies: cookiesNoCompany, body: method === 'POST' ? JSON.stringify({}) : undefined });
        expect(res.status).toBe(403);
      });
    }
  });
});

// ====================================================================
// Section 2: Authentication Tests
// ====================================================================
describe('Authentication (Section 2)', () => {
  const unauthEndpoints: [string, string][] = [
    ['GET', '/api/dashboard'], ['GET', '/api/invoices'], ['GET', '/api/customers'],
    ['GET', '/api/payments'], ['POST', '/api/generate-pdf'], ['POST', '/api/generate-pdf/status'],
    ['POST', '/api/upload/presigned'], ['GET', '/api/income'], ['GET', '/api/expenses'],
    ['GET', '/api/categories'], ['GET', '/api/vendors'],
  ];
  for (const [method, path] of unauthEndpoints) {
    it(`unauthenticated ${method} ${path} returns 401`, async () => {
      const res = await api(path, { method: method as any, body: method === 'POST' ? JSON.stringify({}) : undefined });
      expect(res.status).toBe(401);
    });
  }

  it('invalid credentials → no session', async () => {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const cookies = csrfRes.headers.getSetCookie?.() ?? [];
    const { csrfToken } = await csrfRes.json();
    const cookieStr = cookies.map((c: string) => c.split(';')[0]).join('; ');
    const body = new URLSearchParams({ csrfToken, email: 'nonexistent@test.com', password: 'wrong', json: 'true' });
    await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieStr },
      body: body.toString(),
      redirect: 'manual',
    });
    const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieStr } });
    const session = await sessionRes.json();
    expect(session?.user).toBeFalsy();
  });

  it('valid login returns session', async () => {
    const testCookies = await login(emailA, pass);
    const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: testCookies } });
    const session = await sessionRes.json();
    expect(session?.user?.email).toBe(emailA);
  });
});

// ====================================================================
// Section 4: Payment Tests
// ====================================================================
describe('Payment Tests (Section 4)', () => {
  let paymentInvoiceId = '';

  beforeAll(async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-06-01', currency: 'USD', items: [{ description: 'Payment Test Item', quantity: 1, unitPrice: 100 }] }),
    });
    paymentInvoiceId = (await res.json()).id;
    await api(`/api/invoices/${paymentInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'SENT' }) });
  });

  it('reject overpayment 101.00 on 100.00 invoice', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: paymentInvoiceId, amount: 101.00, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });

  it('partial payment 25.00', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: paymentInvoiceId, amount: 25.00, currency: 'USD' }) });
    expect(res.status).toBeLessThan(300);
    const inv = await api(`/api/invoices/${paymentInvoiceId}`, { cookies: cookiesA });
    const data = await inv.json();
    expect(Number(data.amountPaid)).toBe(25);
    expect(data.status).toBe('PARTIALLY_PAID');
  });

  it('payment 75.00 completes invoice', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: paymentInvoiceId, amount: 75.00, currency: 'USD' }) });
    expect(res.status).toBeLessThan(300);
    const inv = await api(`/api/invoices/${paymentInvoiceId}`, { cookies: cookiesA });
    const data = await inv.json();
    expect(Number(data.amountPaid)).toBe(100);
    expect(data.status).toBe('PAID');
  });

  it('reject 0.01 on fully paid', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: paymentInvoiceId, amount: 0.01, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });

  it('reject zero payment', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: companyAInvoiceId, amount: 0, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });

  it('reject negative payment', async () => {
    const res = await api('/api/payments', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ invoiceId: companyAInvoiceId, amount: -10, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });
});

// ====================================================================
// Section 5: Invoice Status Tests (via API)
// ====================================================================
describe('Invoice Status API (Section 5)', () => {
  let statusInvoiceId = '';

  beforeAll(async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-06-01', items: [{ description: 'Status Test', quantity: 1, unitPrice: 50 }] }),
    });
    statusInvoiceId = (await res.json()).id;
  });

  it('DRAFT → SENT succeeds', async () => {
    const res = await api(`/api/invoices/${statusInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'SENT' }) });
    expect(res.status).toBeLessThan(300);
  });

  it('SENT → VIEWED succeeds', async () => {
    const res = await api(`/api/invoices/${statusInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'VIEWED' }) });
    expect(res.status).toBeLessThan(300);
  });

  it('PAID → DRAFT fails', async () => {
    const inv = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-06-01', items: [{ description: 'Paid test', quantity: 1, unitPrice: 10 }] }),
    });
    const id = (await inv.json()).id;
    await api(`/api/invoices/${id}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'SENT' }) });
    await api(`/api/invoices/${id}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'PAID' }) });
    const res = await api(`/api/invoices/${id}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'DRAFT' }) });
    expect(res.status).toBe(400);
  });

  it('CANCELLED → SENT fails', async () => {
    const inv = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-06-01', items: [{ description: 'Cancel Test', quantity: 1, unitPrice: 10 }] }),
    });
    const id = (await inv.json()).id;
    await api(`/api/invoices/${id}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'CANCELLED' }) });
    const res = await api(`/api/invoices/${id}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'SENT' }) });
    expect(res.status).toBe(400);
  });

  it('invalid status string rejected', async () => {
    const res = await api(`/api/invoices/${statusInvoiceId}`, { method: 'PUT', cookies: cookiesA, body: JSON.stringify({ status: 'GARBAGE' }) });
    expect(res.status).toBe(400);
  });
});

// ====================================================================
// Section 6: Input Validation Tests
// ====================================================================
describe('Input Validation (Section 6)', () => {
  it('negative invoice item price → 400', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', items: [{ description: 'X', quantity: 1, unitPrice: -10 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('zero quantity → 400', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', items: [{ description: 'X', quantity: 0, unitPrice: 10 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('negative quantity → 400', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', items: [{ description: 'X', quantity: -1, unitPrice: 10 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('tax > 100 → 400', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', items: [{ description: 'X', quantity: 1, unitPrice: 10, taxRate: 150 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('invalid currency → 400', async () => {
    const res = await api('/api/invoices', {
      method: 'POST', cookies: cookiesA,
      body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', currency: 'FAKE', items: [{ description: 'X', quantity: 1, unitPrice: 10 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('missing required fields → 400', async () => {
    const res = await api('/api/invoices', { method: 'POST', cookies: cookiesA, body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it('negative expense → 400', async () => {
    const res = await api('/api/expenses', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: 'X', amount: -50, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });

  it('negative income → 400', async () => {
    const res = await api('/api/income', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: 'X', amount: -50, currency: 'USD' }) });
    expect(res.status).toBe(400);
  });

  it('extremely long string → 400', async () => {
    const res = await api('/api/customers', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ name: 'A'.repeat(500) }) });
    expect(res.status).toBe(400);
  });

  it('malformed ID → 404 not 500', async () => {
    const res = await api('/api/customers/not-a-real-id', { cookies: cookiesA });
    expect(res.status).toBe(404);
  });

  it('invalid expense status → 400', async () => {
    const res = await api('/api/expenses', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: 'X', amount: 10, status: 'INVALID' }) });
    expect(res.status).toBe(400);
  });
});

// ====================================================================
// Section 7: Currency Tests
// ====================================================================
describe('Currency Isolation (Section 7)', () => {
  beforeAll(async () => {
    for (const cur of ['EUR', 'TRY'] as const) {
      await api('/api/invoices', {
        method: 'POST', cookies: cookiesA,
        body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-01-01', currency: cur, status: 'SENT', items: [{ description: `${cur} item`, quantity: 1, unitPrice: 100 }] }),
      });
      await api('/api/income', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: `Income ${cur}`, amount: 100, currency: cur, status: 'RECEIVED' }) });
      await api('/api/expenses', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ description: `Expense ${cur}`, amount: 100, currency: cur, status: 'PAID' }) });
    }
  });

  it('dashboard returns byCurrency, not mixed total', async () => {
    const res = await api('/api/dashboard', { cookies: cookiesA });
    const data = await res.json();
    expect(data.byCurrency).toBeDefined();
    expect(data.revenue).toBeUndefined();
    const currencies = Object.keys(data.byCurrency);
    expect(currencies.length).toBeGreaterThanOrEqual(1);
    for (const cur of currencies) {
      expect(data.byCurrency[cur]).toHaveProperty('revenue');
      expect(data.byCurrency[cur]).toHaveProperty('expenses');
      expect(data.byCurrency[cur]).toHaveProperty('receivables');
    }
  });
});

// ====================================================================
// Section 8: Invoice Number Concurrency
// ====================================================================
describe('Invoice Number Concurrency (Section 8)', () => {
  it('5 concurrent creations → unique numbers, no 500', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      api('/api/invoices', {
        method: 'POST', cookies: cookiesA,
        body: JSON.stringify({ customerId: companyACustomerId, dueDate: '2027-12-01', items: [{ description: `Concurrent ${i}`, quantity: 1, unitPrice: 10 }] }),
      })
    );
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status < 300);
    const bodies = await Promise.all(successes.map(r => r.json()));
    const numbers = bodies.map((b: any) => b.invoiceNumber);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
    for (const r of results) {
      expect(r.status).not.toBe(500);
    }
  });
});

// ====================================================================
// Section 9: PDF Security
// ====================================================================
describe('PDF Security (Section 9)', () => {
  it('unauthenticated PDF → 401', async () => {
    const res = await api('/api/generate-pdf', { method: 'POST', body: JSON.stringify({ html_content: '<p>test</p>' }) });
    expect(res.status).toBe(401);
  });
  it('unauthenticated PDF status → 401', async () => {
    const res = await api('/api/generate-pdf/status', { method: 'POST', body: JSON.stringify({ request_id: 'fake' }) });
    expect(res.status).toBe(401);
  });
  it('no-company PDF → 403', async () => {
    const res = await api('/api/generate-pdf', { method: 'POST', cookies: cookiesNoCompany, body: JSON.stringify({ html_content: '<p>test</p>' }) });
    expect(res.status).toBe(403);
  });
  it('valid user can request PDF', async () => {
    const res = await api('/api/generate-pdf', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ html_content: '<p>Valid PDF test</p>' }) });
    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.request_id).toBeTruthy();
  });
});

// ====================================================================
// Section 10: Upload Security
// ====================================================================
describe('Upload Security (Section 10)', () => {
  it('unauthenticated upload → 401', async () => {
    const res = await api('/api/upload/presigned', { method: 'POST', body: JSON.stringify({ fileName: 'test.pdf', contentType: 'application/pdf' }) });
    expect(res.status).toBe(401);
  });
  it('no-company upload → 403', async () => {
    const res = await api('/api/upload/presigned', { method: 'POST', cookies: cookiesNoCompany, body: JSON.stringify({ fileName: 'test.pdf', contentType: 'application/pdf' }) });
    expect(res.status).toBe(403);
  });
  it('valid upload returns company-scoped path', async () => {
    const res = await api('/api/upload/presigned', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ fileName: 'test.pdf', contentType: 'application/pdf' }) });
    expect(res.status).toBeLessThan(300);
    const data = await res.json();
    expect(data.cloud_storage_path).toBeDefined();
    const parts = data.cloud_storage_path.split('/');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
  it('filenames are sanitized', async () => {
    const res = await api('/api/upload/presigned', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ fileName: '../../../etc/passwd', contentType: 'application/pdf' }) });
    expect(res.status).toBeLessThan(300);
    const data = await res.json();
    expect(data.cloud_storage_path).not.toContain('../');
  });
});

// ====================================================================
// Section 11: Onboarding Guard
// ====================================================================
describe('Onboarding Guard (Section 11)', () => {
  it('duplicate company creation rejected', async () => {
    const res = await api('/api/company', { method: 'POST', cookies: cookiesA, body: JSON.stringify({ name: 'Duplicate Company' }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

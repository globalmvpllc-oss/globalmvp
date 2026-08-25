import { describe, it, expect } from 'vitest';
import { sumAmountsByCurrency, sumAmounts } from '@/lib/payment-math';
import { readErrorMessage, messageForStatus, pickErrorMessage } from '@/lib/api-feedback';

/**
 * Two defects the income and expense pages shared.
 *
 * The summaries added every row together and labelled the result with the first
 * row's currency, so a company holding both TRY and USD income saw a number
 * that was not money in either. The dashboard and reports already grouped by
 * currency; these pages did not.
 *
 * Separately, delete and mark-as-paid fired their request and announced success
 * without reading the response.
 */

const income = [
  { amount: 1000, currency: 'TRY', status: 'RECEIVED' },
  { amount: 100, currency: 'USD', status: 'RECEIVED' },
  { amount: 50, currency: 'USD', status: 'EXPECTED' },
];

describe('sumAmountsByCurrency', () => {
  it('keeps currencies apart instead of adding them together', () => {
    const totals = sumAmountsByCurrency(
      income.filter((t) => t.status === 'RECEIVED'),
      (t) => t.amount,
      (t) => t.currency
    );
    expect(totals).toEqual([
      { currency: 'TRY', total: 1000 },
      { currency: 'USD', total: 100 },
    ]);
  });

  it('does not produce the old cross-currency figure', () => {
    // The previous behaviour: 1000 + 100 = 1100, labelled TRY.
    const received = income.filter((t) => t.status === 'RECEIVED');
    expect(sumAmounts(received, (t) => t.amount)).toBe(1100);
    const grouped = sumAmountsByCurrency(received, (t) => t.amount, (t) => t.currency);
    expect(grouped.some((r) => r.total === 1100)).toBe(false);
  });

  it('sums several rows of the same currency', () => {
    const rows = [
      { amount: 10, currency: 'EUR' },
      { amount: 15.5, currency: 'EUR' },
    ];
    expect(sumAmountsByCurrency(rows, (r) => r.amount, (r) => r.currency)).toEqual([
      { currency: 'EUR', total: 25.5 },
    ]);
  });

  it('coerces Decimal values that arrive as strings', () => {
    const rows = [
      { amount: '10.25', currency: 'USD' },
      { amount: '0.75', currency: 'USD' },
    ];
    expect(sumAmountsByCurrency(rows, (r) => r.amount, (r) => r.currency)).toEqual([
      { currency: 'USD', total: 11 },
    ]);
  });

  it('returns an empty list for no rows, rather than a zero in a guessed currency', () => {
    expect(sumAmountsByCurrency([], (r: any) => r.amount, (r: any) => r.currency)).toEqual([]);
  });

  it.each([null, undefined, ''])('falls back when the currency is %s', (currency) => {
    const rows = [{ amount: 5, currency }];
    expect(sumAmountsByCurrency(rows, (r) => r.amount, (r) => r.currency, 'GBP')).toEqual([
      { currency: 'GBP', total: 5 },
    ]);
  });

  it('orders currencies consistently between renders', () => {
    const rows = [
      { amount: 1, currency: 'USD' },
      { amount: 1, currency: 'EUR' },
      { amount: 1, currency: 'TRY' },
    ];
    const codes = sumAmountsByCurrency(rows, (r) => r.amount, (r) => r.currency).map((r) => r.currency);
    expect(codes).toEqual(['EUR', 'TRY', 'USD']);
  });

  it('ignores unusable amounts instead of producing NaN', () => {
    const rows = [
      { amount: 'not-a-number', currency: 'USD' },
      { amount: 10, currency: 'USD' },
    ];
    const [usd] = sumAmountsByCurrency(rows, (r) => r.amount, (r) => r.currency);
    expect(usd.total).toBe(10);
    expect(Number.isNaN(usd.total)).toBe(false);
  });
});

/** Minimal Response stand-ins; no DOM required. */
function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

function nonJsonResponse(status: number): Response {
  return {
    status,
    ok: false,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
}

describe('delete and status changes report the truth', () => {
  /** Mirrors the handler shape now used on the income and expense pages. */
  async function runAction(res: Response): Promise<{ toast: 'success' | 'error'; message: string }> {
    if (!res.ok) return { toast: 'error', message: await readErrorMessage(res) };
    return { toast: 'success', message: 'Deleted' };
  }

  it('reports an error when a delete is refused', async () => {
    const result = await runAction(jsonResponse(404, { error: 'Not found' }));
    // The old handler said "Deleted" here regardless of status.
    expect(result.toast).toBe('error');
    expect(result.message).toBe(messageForStatus(404));
  });

  it('reports an error when the session has expired', async () => {
    const result = await runAction(jsonResponse(401, { error: 'Unauthorized' }));
    expect(result.toast).toBe('error');
    expect(result.message).toBe('Your session has expired. Please sign in again.');
  });

  it('reports an error when the record belongs to another business', async () => {
    const result = await runAction(jsonResponse(403, { error: 'No company access' }));
    expect(result.toast).toBe('error');
    expect(result.message).toBe("You don't have access to this business.");
  });

  it('still reports success on a genuine 200', async () => {
    expect((await runAction(jsonResponse(200, { success: true }))).toast).toBe('success');
  });

  it('produces a message even when the error body is not JSON', async () => {
    const result = await runAction(nonJsonResponse(500));
    expect(result.toast).toBe('error');
    expect(result.message).toBe(messageForStatus(500));
  });

  it('keeps a specific server message when there is one', () => {
    const msg = 'Expense has linked payments and cannot be deleted.';
    expect(pickErrorMessage(409, { error: msg })).toBe(msg);
  });
});

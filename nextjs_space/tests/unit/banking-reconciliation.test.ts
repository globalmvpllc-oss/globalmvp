import { describe, it, expect } from 'vitest';
import {
  UNRECONCILED_WHERE,
  cashPositionByCurrency,
  effectiveStatus,
  isUnreconciled,
  matchLinkData,
  netMovement,
  reconciliationRate,
  resolveMatchTarget,
  signedAmount,
  type MatchLinks,
} from '@/lib/banking/reconciliation';
import { candidateTypesForDirection } from '@/lib/banking/candidates';
import { TARGET_DIRECTIONS, MATCH_TARGET_TYPES } from '@/lib/banking/types';
import { getProvider, isKnownProvider, listProviders, manualProvider } from '@/lib/banking/providers';

/** A stored bank line with no links, as freshly imported. */
const unlinked: MatchLinks & { status: string } = {
  status: 'UNMATCHED',
  matchedInvoiceId: null,
  matchedPaymentId: null,
  matchedIncomeId: null,
  matchedExpenseId: null,
};

describe('a match is the presence of a link, not a status column', () => {
  it('reads a linked row as matched', () => {
    expect(effectiveStatus({ ...unlinked, status: 'MATCHED', matchedInvoiceId: 'inv_1' })).toBe('MATCHED');
  });

  it('reads an unlinked row as unmatched', () => {
    expect(effectiveStatus(unlinked)).toBe('UNMATCHED');
  });

  it('returns a row to the queue when the record it pointed at was deleted', () => {
    // ON DELETE SET NULL clears the link but cannot rewrite the status column,
    // so a row would otherwise claim MATCHED while pointing at nothing: the
    // screen would show a match the user cannot open, and the unreconciled
    // count would under-report.
    const orphaned = { ...unlinked, status: 'MATCHED' };
    expect(effectiveStatus(orphaned)).toBe('UNMATCHED');
    expect(isUnreconciled(orphaned)).toBe(true);
  });

  it('keeps an ignored line ignored even after its record disappears', () => {
    // Ignoring is an explicit human decision that this line needs no
    // counterpart. Nothing else happening in the database may undo it.
    expect(effectiveStatus({ ...unlinked, status: 'IGNORED' })).toBe('IGNORED');
    expect(effectiveStatus({ ...unlinked, status: 'IGNORED', matchedInvoiceId: 'inv_1' })).toBe('IGNORED');
  });
});

describe('the database filter and the in-memory rule agree', () => {
  it('the filter selects exactly the rows effectiveStatus calls unmatched', () => {
    // These two have to stay in step: one runs in Postgres for the counts, the
    // other in Node for the display. A disagreement shows up as a badge that
    // does not match the list beneath it.
    const rows: Array<MatchLinks & { status: string }> = [
      unlinked,
      { ...unlinked, status: 'MATCHED' },                            // orphaned
      { ...unlinked, status: 'MATCHED', matchedInvoiceId: 'a' },
      { ...unlinked, status: 'MATCHED', matchedPaymentId: 'b' },
      { ...unlinked, status: 'MATCHED', matchedIncomeId: 'c' },
      { ...unlinked, status: 'MATCHED', matchedExpenseId: 'd' },
      { ...unlinked, status: 'IGNORED' },
    ];

    /** Applies UNRECONCILED_WHERE the way Postgres would. */
    const selectedBySql = (row: MatchLinks & { status: string }) =>
      row.status !== UNRECONCILED_WHERE.status.not &&
      row.matchedInvoiceId === null &&
      row.matchedPaymentId === null &&
      row.matchedIncomeId === null &&
      row.matchedExpenseId === null;

    for (const row of rows) {
      expect(selectedBySql(row), JSON.stringify(row)).toBe(isUnreconciled(row));
    }
  });

  it('names every link column, so a new one cannot be forgotten silently', () => {
    const linkColumns = Object.keys(UNRECONCILED_WHERE).filter((k) => k !== 'status');
    expect(linkColumns.sort()).toEqual(
      ['matchedExpenseId', 'matchedIncomeId', 'matchedInvoiceId', 'matchedPaymentId']
    );
    expect(linkColumns).toHaveLength(MATCH_TARGET_TYPES.length);
  });
});

describe('resolving and writing the link', () => {
  it('reports which kind of record a line is linked to', () => {
    expect(resolveMatchTarget({ ...unlinked, matchedIncomeId: 'inc_1' })).toEqual({
      type: 'INCOME',
      id: 'inc_1',
    });
    expect(resolveMatchTarget(unlinked)).toBeNull();
  });

  it('sets one link and clears the other three', () => {
    // A row with two links would be double-counted and would hold two records
    // out of the candidate pool at once.
    const data = matchLinkData({ type: 'EXPENSE', id: 'exp_1' });
    expect(data).toEqual({
      matchedInvoiceId: null,
      matchedPaymentId: null,
      matchedIncomeId: null,
      matchedExpenseId: 'exp_1',
    });
  });

  it('clears all four when unmatching', () => {
    expect(Object.values(matchLinkData(null)).every((v) => v === null)).toBe(true);
  });

  it('round-trips through resolveMatchTarget for every target kind', () => {
    for (const type of MATCH_TARGET_TYPES) {
      expect(resolveMatchTarget(matchLinkData({ type, id: 'x' }))).toEqual({ type, id: 'x' });
    }
  });
});

describe('direction rules', () => {
  it('only lets money in settle an invoice or income', () => {
    expect(TARGET_DIRECTIONS.INVOICE).toEqual(['CREDIT']);
    expect(TARGET_DIRECTIONS.INCOME).toEqual(['CREDIT']);
  });

  it('only lets money out settle an expense', () => {
    expect(TARGET_DIRECTIONS.EXPENSE).toEqual(['DEBIT']);
  });

  it('loads only the kinds a given direction could possibly settle', () => {
    expect(candidateTypesForDirection('CREDIT')).toEqual(['PAYMENT', 'INVOICE', 'INCOME']);
    expect(candidateTypesForDirection('DEBIT')).toEqual(['PAYMENT', 'EXPENSE']);
  });
});

describe('signed movement', () => {
  it('treats a debit as a reduction and a credit as an increase', () => {
    expect(signedAmount({ amount: '100.00', direction: 'DEBIT' }).toFixed(2)).toBe('-100.00');
    expect(signedAmount({ amount: '100.00', direction: 'CREDIT' }).toFixed(2)).toBe('100.00');
  });

  it('nets a set of lines with Decimal rather than floating point', () => {
    const total = netMovement([
      { amount: '0.10', direction: 'CREDIT' },
      { amount: '0.20', direction: 'CREDIT' },
    ]);
    expect(total.toFixed(2)).toBe('0.30');
    // The float answer would be 0.30000000000000004.
    expect(total.toString()).toBe('0.3');
  });

  it('is zero for no lines at all', () => {
    expect(netMovement([]).toFixed(2)).toBe('0.00');
  });
});

describe('cash position', () => {
  it('groups by currency and never converts between them', () => {
    // There is no exchange-rate source in this application. A single combined
    // figure would be invented financial data.
    const position = cashPositionByCurrency([
      { currency: 'USD', lastBalance: '1000.00' },
      { currency: 'TRY', lastBalance: '50000.00' },
      { currency: 'USD', lastBalance: '250.50' },
    ]);

    expect(position).toEqual([
      { currency: 'TRY', total: '50000.00', accounts: 1, accountsWithoutBalance: 0 },
      { currency: 'USD', total: '1250.50', accounts: 2, accountsWithoutBalance: 0 },
    ]);
  });

  it('counts an account with no reported balance instead of treating it as zero', () => {
    // "We do not know" and "it is empty" are different answers, and only one is
    // safe to present as a cash position.
    const position = cashPositionByCurrency([
      { currency: 'USD', lastBalance: '1000.00' },
      { currency: 'USD', lastBalance: null },
    ]);
    expect(position[0]).toEqual({
      currency: 'USD',
      total: '1000.00',
      accounts: 2,
      accountsWithoutBalance: 1,
    });
  });

  it('treats an undefined balance the same as a null one', () => {
    expect(cashPositionByCurrency([{ currency: 'USD' }])[0].accountsWithoutBalance).toBe(1);
  });

  it('is ordered by currency, so the dashboard does not reshuffle between loads', () => {
    const codes = cashPositionByCurrency([
      { currency: 'USD', lastBalance: '1' },
      { currency: 'EUR', lastBalance: '1' },
      { currency: 'GBP', lastBalance: '1' },
    ]).map((p) => p.currency);
    expect(codes).toEqual(['EUR', 'GBP', 'USD']);
  });

  it('is empty for a company with no accounts', () => {
    expect(cashPositionByCurrency([])).toEqual([]);
  });
});

describe('reconciliation rate', () => {
  it('counts an ignored line as dealt with', () => {
    // Someone looked at it and decided it needs no counterpart. That is a
    // completed decision, not outstanding work.
    expect(reconciliationRate({ matched: 5, ignored: 5, unmatched: 0 })).toBe(100);
  });

  it('reports the share resolved', () => {
    expect(reconciliationRate({ matched: 1, ignored: 0, unmatched: 1 })).toBe(50);
    expect(reconciliationRate({ matched: 0, ignored: 0, unmatched: 4 })).toBe(0);
  });

  it('is 100 for an account with nothing in it, not a division by zero', () => {
    expect(reconciliationRate({ matched: 0, ignored: 0, unmatched: 0 })).toBe(100);
  });
});

describe('the provider registry stays open for real connectors', () => {
  it('ships the manual provider and nothing that claims to sync', () => {
    expect(listProviders().map((p) => p.id)).toEqual(['manual']);
    expect(manualProvider.canSync).toBe(false);
  });

  it('resolves a known provider and refuses an unknown one', () => {
    expect(getProvider('manual')).toBe(manualProvider);
    expect(getProvider('plaid')).toBeNull();
    expect(getProvider(undefined)).toBeNull();
    expect(isKnownProvider('manual')).toBe(true);
    expect(isKnownProvider('wise')).toBe(false);
  });

  it('returns no transactions for a manual account rather than throwing', async () => {
    // A caller looping over accounts should not have to special-case this one;
    // `canSync` is what callers branch on.
    await expect(
      manualProvider.fetchTransactions({
        account: {
          id: 'acc_1',
          provider: 'manual',
          providerAccountId: null,
          currency: 'USD',
          lastSyncedAt: null,
        },
      })
    ).resolves.toEqual([]);
  });
});

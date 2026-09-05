import { describe, it, expect } from 'vitest';
import {
  AMOUNT_TOLERANCE,
  AUTO_MATCH_MIN_MARGIN,
  AUTO_MATCH_MIN_SCORE,
  MAX_DATE_DISTANCE_DAYS,
  daysBetween,
  pickAutoMatch,
  rankCandidates,
  referenceMatches,
  scoreCandidate,
  type ScorableTransaction,
} from '@/lib/banking/matching';
import type { MatchCandidate } from '@/lib/banking/types';

/**
 * The reconciliation matcher.
 *
 * The property that matters most here is not that good matches are found — it
 * is that bad ones are refused. A confidently wrong link tells someone their
 * books agree with their bank when they do not, and that wrongness survives
 * into every report afterwards. So most of what follows pins the refusals.
 */

const bankLine: ScorableTransaction = {
  date: '2026-09-01',
  description: 'PAYMENT FROM ACME LTD',
  amount: '1200.00',
  currency: 'USD',
  direction: 'CREDIT',
  reference: null,
};

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    type: 'INVOICE',
    id: 'inv_1',
    label: 'Invoice INV-2026-014',
    amount: 1200,
    currency: 'USD',
    date: '2026-09-01',
    direction: 'CREDIT',
    ...overrides,
  };
}

describe('hard rules disqualify rather than penalise', () => {
  it('refuses a candidate in a different currency', () => {
    // The payments API already refuses to settle a TRY invoice with a USD
    // payment. Suggesting exactly that pairing would be incoherent.
    expect(scoreCandidate(bankLine, candidate({ currency: 'TRY' }))).toBeNull();
  });

  it('refuses money in against money out', () => {
    expect(
      scoreCandidate(bankLine, candidate({ type: 'EXPENSE', direction: 'DEBIT' }))
    ).toBeNull();
  });

  it('refuses an amount outside the one-cent tolerance', () => {
    expect(scoreCandidate(bankLine, candidate({ amount: 1200.02 }))).toBeNull();
    expect(scoreCandidate(bankLine, candidate({ amount: 1199.98 }))).toBeNull();
  });

  it('accepts an amount exactly at the tolerance', () => {
    expect(AMOUNT_TOLERANCE.toString()).toBe('0.01');
    expect(scoreCandidate(bankLine, candidate({ amount: 1200.01 }))).not.toBeNull();
    expect(scoreCandidate(bankLine, candidate({ amount: 1199.99 }))).not.toBeNull();
  });

  it('refuses a candidate with nothing left to settle', () => {
    // An invoice whose outstanding balance is zero is already paid; matching a
    // deposit to it would double-count the money.
    expect(scoreCandidate({ ...bankLine, amount: '0.00' }, candidate({ amount: 0 }))).toBeNull();
  });

  it('refuses a candidate beyond the date horizon', () => {
    const farAway = candidate({ date: '2026-12-31' });
    expect(daysBetween('2026-09-01', '2026-12-31')).toBeGreaterThan(MAX_DATE_DISTANCE_DAYS);
    expect(scoreCandidate(bankLine, farAway)).toBeNull();
  });

  it('does not confuse an unparseable date with a close one', () => {
    expect(scoreCandidate(bankLine, candidate({ date: 'not a date' }))).toBeNull();
  });
});

describe('amount arithmetic uses Decimal, not floating point', () => {
  it('accepts 0.1 + 0.2 against 0.30 without a float comparison deciding it', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754, so `===` against 0.3 is
    // false. Decimal keeps that difference inside the one-cent window and the
    // pairing scores exactly as an on-the-day match should.
    const line: ScorableTransaction = { ...bankLine, amount: '0.30' };
    const result = scoreCandidate(line, candidate({ amount: 0.1 + 0.2 }));
    expect(result).not.toBeNull();
    expect(result!.score).toBe(90);
  });

  it('reports an exact amount as exact when the values really are equal', () => {
    const result = scoreCandidate({ ...bankLine, amount: '0.30' }, candidate({ amount: 0.3 }));
    expect(result?.reasons).toContain('Exact amount');
  });

  it('reads a Decimal-serialised string amount', () => {
    // Prisma returns DECIMAL columns as strings over JSON.
    const result = scoreCandidate({ ...bankLine, amount: '1200.00' }, candidate({ amount: 1200 }));
    expect(result?.score).toBe(90);
  });
});

describe('scoring rewards the right things', () => {
  it('gives an exact same-day amount exactly the automatic threshold', () => {
    const result = scoreCandidate(bankLine, candidate());
    expect(result?.score).toBe(AUTO_MATCH_MIN_SCORE);
  });

  it('scores lower the further apart the dates are', () => {
    const sameDay = scoreCandidate(bankLine, candidate())!.score;
    const twoDays = scoreCandidate(bankLine, candidate({ date: '2026-09-03' }))!.score;
    const threeWeeks = scoreCandidate(bankLine, candidate({ date: '2026-09-22' }))!.score;

    expect(sameDay).toBeGreaterThan(twoDays);
    expect(twoDays).toBeGreaterThan(threeWeeks);
  });

  it('rewards the document number appearing in the statement text', () => {
    const withRef = scoreCandidate(
      { ...bankLine, description: 'TRANSFER REF INV-2026-014' },
      candidate({ date: '2026-09-05', reference: 'INV-2026-014' })
    );
    const withoutRef = scoreCandidate(bankLine, candidate({ date: '2026-09-05' }));
    expect(withRef!.score).toBeGreaterThan(withoutRef!.score);
  });

  it('never exceeds 100', () => {
    const result = scoreCandidate(
      { ...bankLine, description: 'PAYMENT INV-2026-014' },
      candidate({ reference: 'INV-2026-014' })
    );
    expect(result!.score).toBeLessThanOrEqual(100);
  });
});

describe('reference matching ignores punctuation but not brevity', () => {
  it('matches across differing separators', () => {
    expect(
      referenceMatches({ description: 'FT PAYMENT INV2026014 ACME' }, 'INV-2026-014')
    ).toBe(true);
    expect(referenceMatches({ description: 'ref inv/2026/014' }, 'INV-2026-014')).toBe(true);
  });

  it('also looks in the statement reference field, not only the description', () => {
    expect(
      referenceMatches({ description: 'BANK TRANSFER', reference: 'INV-2026-014' }, 'INV-2026-014')
    ).toBe(true);
  });

  it('ignores references too short to be meaningful', () => {
    // "12" appears in half of all statement lines by accident.
    expect(referenceMatches({ description: 'PAYMENT 12345' }, '12')).toBe(false);
  });

  it('is false when the candidate has no reference at all', () => {
    expect(referenceMatches({ description: 'anything' }, undefined)).toBe(false);
  });
});

describe('ranking', () => {
  it('drops disqualified candidates rather than ranking them last', () => {
    const ranked = rankCandidates(bankLine, [
      candidate({ id: 'ok' }),
      candidate({ id: 'wrong-currency', currency: 'EUR' }),
      candidate({ id: 'wrong-direction', direction: 'DEBIT' }),
      candidate({ id: 'wrong-amount', amount: 999 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(['ok']);
  });

  it('returns the strongest candidate first', () => {
    const ranked = rankCandidates(bankLine, [
      candidate({ id: 'later', date: '2026-09-20' }),
      candidate({ id: 'same-day' }),
      candidate({ id: 'near', date: '2026-09-02' }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(['same-day', 'near', 'later']);
  });

  it('orders ties deterministically, so the list does not reshuffle on refresh', () => {
    const first = rankCandidates(bankLine, [
      candidate({ id: 'b', type: 'INCOME' }),
      candidate({ id: 'a', type: 'INVOICE' }),
    ]);
    const second = rankCandidates(bankLine, [
      candidate({ id: 'a', type: 'INVOICE' }),
      candidate({ id: 'b', type: 'INCOME' }),
    ]);
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });
});

describe('automatic matching only acts when it is unambiguous', () => {
  it('matches an exact amount on the same day', () => {
    const best = pickAutoMatch(bankLine, [candidate()]);
    expect(best?.id).toBe('inv_1');
  });

  it('declines when nothing is plausible', () => {
    expect(pickAutoMatch(bankLine, [])).toBeNull();
    expect(pickAutoMatch(bankLine, [candidate({ currency: 'GBP' })])).toBeNull();
  });

  it('declines an exact amount a week later', () => {
    // At that distance two invoices for the same amount are entirely ordinary,
    // so this needs a person rather than a guess.
    const best = pickAutoMatch(bankLine, [candidate({ date: '2026-09-08' })]);
    expect(best).toBeNull();
  });

  it('declines when two candidates are equally good', () => {
    // Two invoices for 1,200 USD on the same day. Picking either is a coin
    // flip, and a coin flip in someone's books is the worst possible outcome.
    const best = pickAutoMatch(bankLine, [
      candidate({ id: 'inv_a' }),
      candidate({ id: 'inv_b' }),
    ]);
    expect(best).toBeNull();
  });

  it('acts when the winner is clear of the runner-up by the required margin', () => {
    const best = pickAutoMatch(
      { ...bankLine, description: 'PAYMENT INV-2026-014' },
      [
        candidate({ id: 'strong', reference: 'INV-2026-014' }), // 60 + 30 + 10
        candidate({ id: 'weak', date: '2026-09-25' }),          // 60 + 6
      ]
    );
    expect(best?.id).toBe('strong');
    expect(best!.score - AUTO_MATCH_MIN_MARGIN).toBeGreaterThanOrEqual(AUTO_MATCH_MIN_SCORE - 10);
  });

  it('still declines when a near-tie clears the score threshold', () => {
    // Both above 90, three points apart — high confidence in the wrong record
    // is exactly the failure this margin exists to prevent.
    const best = pickAutoMatch(
      { ...bankLine, description: 'PAYMENT INV-2026-014' },
      [
        candidate({ id: 'a', reference: 'INV-2026-014' }),
        candidate({ id: 'b', reference: 'INV-2026-014', date: '2026-09-01' }),
      ]
    );
    expect(best).toBeNull();
  });

  it('honours a caller-supplied threshold', () => {
    const loose = pickAutoMatch(bankLine, [candidate({ date: '2026-09-08' })], { minScore: 70 });
    expect(loose?.id).toBe('inv_1');
  });
});

describe('daysBetween', () => {
  it('is symmetric and ignores time of day', () => {
    expect(daysBetween('2026-09-01T23:00:00Z', '2026-09-03T01:00:00Z')).toBe(2);
    expect(daysBetween('2026-09-03', '2026-09-01')).toBe(2);
  });

  it('returns null for an unreadable date', () => {
    expect(daysBetween('nonsense', '2026-09-01')).toBeNull();
  });
});

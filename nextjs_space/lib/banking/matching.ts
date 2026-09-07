import Decimal from 'decimal.js';
import type {
  BankDirection,
  MatchCandidate,
  NormalizedBankTransaction,
  ScoredCandidate,
} from './types';

/**
 * Deciding which financial record a bank line belongs to.
 *
 * Pure — no Prisma, no session, no clock beyond the dates it is handed. The
 * candidate list is assembled by candidates.ts, which is the only part that
 * touches the database; everything about *choosing* lives here so the rules can
 * be tested exhaustively.
 *
 * Two principles the scoring is built around:
 *
 *   1. **A wrong automatic match is worse than no match.** Reconciliation exists
 *      to tell someone their books agree with their bank; a confident-but-wrong
 *      link is a lie that survives into reports. So the hard rules below
 *      disqualify rather than penalise, and an automatic match additionally
 *      requires that no runner-up is close.
 *   2. **Money comparisons use Decimal**, like every other financial path in
 *      this codebase. Floating point makes 0.1 + 0.2 !== 0.3, which at a
 *      one-cent tolerance is the difference between matched and not.
 */

// --- Hard rules --------------------------------------------------------------

/**
 * How far apart two amounts may be and still be the same transaction.
 *
 * One cent, to absorb rounding in a statement export — not bank fees or partial
 * settlement. A line that is genuinely a different amount is a different fact
 * about the business and a person should look at it.
 */
export const AMOUNT_TOLERANCE = new Decimal('0.01');

/** Beyond this a same-amount coincidence is far likelier than a real pairing. */
export const MAX_DATE_DISTANCE_DAYS = 60;

// --- Score weights -----------------------------------------------------------

/** Amount agreement is the precondition, and carries the largest single weight. */
const AMOUNT_POINTS = 60;

/** Date proximity, in whole days of separation. Ordered, first match wins. */
const DATE_BANDS: Array<{ within: number; points: number; reason: string; key: string }> = [
  { within: 0, points: 30, reason: 'Same day', key: 'banking.reasonSameDay' },
  { within: 2, points: 24, reason: 'Within 2 days', key: 'banking.reasonWithinDays' },
  { within: 5, points: 18, reason: 'Within 5 days', key: 'banking.reasonWithinDays' },
  { within: 10, points: 12, reason: 'Within 10 days', key: 'banking.reasonWithinDays' },
  { within: 30, points: 6, reason: 'Within 30 days', key: 'banking.reasonWithinDays' },
  { within: MAX_DATE_DISTANCE_DAYS, points: 2, reason: 'Within 60 days', key: 'banking.reasonWithinDays' },
];

/** The reference or document number appearing in the statement text. */
const REFERENCE_POINTS = 10;

/**
 * The score an automatic match must reach.
 *
 * 90 is deliberately just at "exact amount on the same day" (60 + 30). Anything
 * looser — an exact amount a week later — needs a person, because at that
 * distance two invoices for the same amount are entirely ordinary.
 */
export const AUTO_MATCH_MIN_SCORE = 90;

/**
 * How far clear the winner must be.
 *
 * Two invoices for 1,000 USD on the same day both score 90. Picking either is a
 * coin flip, so the matcher picks neither and both stay in the queue.
 */
export const AUTO_MATCH_MIN_MARGIN = 10;

// --- Helpers -----------------------------------------------------------------

/** Whole days between two calendar dates, ignoring time of day. */
export function daysBetween(a: string | Date, b: string | Date): number | null {
  const left = toUtcDay(a);
  const right = toUtcDay(b);
  if (left === null || right === null) return null;
  return Math.round(Math.abs(left - right) / 86_400_000);
}

/** UTC midnight of the calendar day a value names, in milliseconds. */
function toUtcDay(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Normalises text for the reference comparison: case and punctuation removed. */
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Whether the candidate's reference appears in the statement line.
 *
 * Punctuation is stripped from both sides, so "INV-2026-014" in the invoice
 * matches "INV2026014" or "PAYMENT INV/2026/014" in the bank text. References
 * shorter than four characters are ignored: "12" appears in half of all
 * statement lines by accident.
 */
export function referenceMatches(
  transaction: Pick<NormalizedBankTransaction, 'description' | 'reference'>,
  candidateReference: string | undefined
): boolean {
  if (!candidateReference) return false;
  const needle = normalizeText(candidateReference);
  if (needle.length < 4) return false;

  const haystack = normalizeText(`${transaction.description} ${transaction.reference ?? ''}`);
  return haystack.includes(needle);
}

// --- Scoring -----------------------------------------------------------------

/** What a bank line needs to expose to be scored. Deliberately narrower than the
 *  stored row, so both a normalised import row and a database row fit. */
export interface ScorableTransaction {
  date: string | Date;
  description: string;
  amount: Decimal.Value;
  currency: string;
  direction: BankDirection;
  reference?: string | null;
}

/**
 * Scores one candidate against one bank line.
 *
 * Returns null when a hard rule disqualifies the pairing — that is not the same
 * as a score of zero, and callers must drop such candidates rather than rank
 * them last. A currency mismatch is not a weak match; it is not a match.
 */
export function scoreCandidate(
  transaction: ScorableTransaction,
  candidate: MatchCandidate
): ScoredCandidate | null {
  // Currency. The payments API already refuses to settle a TRY invoice with a
  // USD payment; reconciliation must hold the same line, or it would suggest
  // exactly the pairing that API rejects.
  if (transaction.currency !== candidate.currency) return null;

  // Direction. A credit cannot pay an expense, and a debit cannot settle an
  // invoice — regardless of how well the numbers line up.
  if (transaction.direction !== candidate.direction) return null;

  const txAmount = new Decimal(String(transaction.amount));
  const candidateAmount = new Decimal(String(candidate.amount));
  if (candidateAmount.lte(0)) return null; // nothing left to settle
  if (txAmount.minus(candidateAmount).abs().gt(AMOUNT_TOLERANCE)) return null;

  const distance = daysBetween(transaction.date, candidate.date);
  if (distance === null || distance > MAX_DATE_DISTANCE_DAYS) return null;

  const reasons: string[] = [];
  // The same reasons as keys, so the screen can draw them in the reader's
  // language. Kept alongside the English array rather than replacing it.
  const reasonCodes: Array<{ key: string; values?: Record<string, string> }> = [];
  let score = AMOUNT_POINTS;

  const exact = txAmount.equals(candidateAmount);
  reasons.push(exact ? 'Exact amount' : 'Amount within one cent');
  reasonCodes.push({ key: exact ? 'banking.reasonExactAmount' : 'banking.reasonNearAmount' });

  const band = DATE_BANDS.find((b) => distance <= b.within);
  if (band) {
    score += band.points;
    reasons.push(band.reason);
    reasonCodes.push(
      band.within === 0
        ? { key: band.key }
        : { key: band.key, values: { days: String(band.within) } }
    );
  }

  const description = transaction.description;
  const reference = transaction.reference ?? undefined;
  if (referenceMatches({ description, reference }, candidate.reference)) {
    score += REFERENCE_POINTS;
    reasons.push(`Reference "${candidate.reference}" appears on the statement line`);
    reasonCodes.push({
      key: 'banking.reasonReference',
      values: { reference: String(candidate.reference ?? '') },
    });
  }

  return { ...candidate, score: Math.min(score, 100), reasons, reasonCodes };
}

/**
 * Scores every candidate and returns the plausible ones, best first.
 *
 * Ties are broken by type and then by id so the order is stable between
 * requests — a suggestion list that reshuffles on every refresh is unusable.
 */
export function rankCandidates(
  transaction: ScorableTransaction,
  candidates: MatchCandidate[]
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const result = scoreCandidate(transaction, candidate);
    if (result) scored.push(result);
  }

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.id.localeCompare(b.id);
  });
}

export interface AutoMatchOptions {
  minScore?: number;
  minMargin?: number;
}

/**
 * The one candidate safe to link without asking, or null.
 *
 * Null covers three different situations that all have the same correct
 * response — leave it for a person: nothing was plausible, the best was not
 * convincing enough, or two candidates were too close to separate.
 */
export function pickAutoMatch(
  transaction: ScorableTransaction,
  candidates: MatchCandidate[],
  options: AutoMatchOptions = {}
): ScoredCandidate | null {
  const minScore = options.minScore ?? AUTO_MATCH_MIN_SCORE;
  const minMargin = options.minMargin ?? AUTO_MATCH_MIN_MARGIN;

  const ranked = rankCandidates(transaction, candidates);
  const best = ranked[0];
  if (!best || best.score < minScore) return null;

  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < minMargin) return null;

  return best;
}

/** How many suggestions the UI asks for. Enough to choose from, few enough to read. */
export const MAX_SUGGESTIONS = 8;

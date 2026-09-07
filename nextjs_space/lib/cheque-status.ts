import type { TranslationKey } from '@/lib/i18n';

/**
 * The lifecycle of a cheque or promissory note.
 *
 * Modelled the way `lib/invoice-status.ts` models an invoice: an explicit
 * transition table, final states, and a `canTransition` guard — so an invalid
 * jump is refused by the model rather than by whoever happened to write the
 * screen.
 *
 * ## Two directions, two lifecycles
 *
 * A **received** cheque is held in portfolio (portföy), then presented to the
 * bank, then either clears or bounces. It sits in a drawer in between, which is
 * exactly why it needs a state of its own: it is neither cash nor a plain
 * receivable.
 *
 * An **issued** cheque is outstanding from the moment it is written until the
 * day the holder presents it, at which point it is paid or it bounces. There is
 * no PRESENTED step, because presenting is something the other party does and
 * this business does not observe it — it learns the outcome.
 *
 * BOUNCED (karşılıksız) is a first-class state in both, not a flag. It is the
 * case that actually costs a business money, and recording it must be a normal
 * action rather than an edit of a field.
 *
 * ## Settled is not the same as final
 *
 * Two ideas that were one, and had to be separated.
 *
 * `SETTLED_STATUSES` is "no longer live": the instrument has left the drawer,
 * so it stops counting towards what is held. CLEARED, PAID, BOUNCED, CANCELLED.
 *
 * `FINAL_STATUSES` is "can never change again": BOUNCED and CANCELLED only.
 *
 * CLEARED used to be both, and that was wrong. A business marks a cheque
 * cleared on its due date and the bank returns it days later — that *is* the
 * karşılıksız case, and refusing the transition forced the user to delete the
 * instrument and its payment by hand, losing the record of the bounce, which is
 * the one thing they most need to keep. CLEARED and PAID may now move to
 * BOUNCED, and the route reverses the payment when they do.
 *
 * They remain settled throughout, so no total counts a cleared cheque as held,
 * and neither can be edited: the amount of a cheque that has already produced a
 * payment is history.
 *
 * ## What a state means for money
 *
 * Nothing here moves money. An instrument in PORTFOLIO or PRESENTED is a
 * promise: it contributes to no total that says "collected", and the invoice it
 * relates to stays exactly as outstanding as it was. Only CLEARED and PAID mean
 * money moved, and even then the money is a `Payment` row created by the route
 * — see the note on `SETTLING_STATUSES`.
 */

export const CHEQUE_DIRECTIONS = ['RECEIVED', 'ISSUED'] as const;
export type ChequeDirection = (typeof CHEQUE_DIRECTIONS)[number];

export const CHEQUE_INSTRUMENTS = ['CHEQUE', 'PROMISSORY_NOTE'] as const;
export type ChequeInstrumentType = (typeof CHEQUE_INSTRUMENTS)[number];

/**
 * Every status either direction can hold.
 *
 * One list rather than two enums, matching how `Invoice.status` is stored: a
 * plain String column, with the direction deciding which values are reachable.
 */
export const CHEQUE_STATUSES = [
  /** Received, in the drawer, not yet presented. Portföy. */
  'PORTFOLIO',
  /** Received, handed to the bank, outcome not yet known. */
  'PRESENTED',
  /** Received, the money arrived. Settled — but a bank can still return it. */
  'CLEARED',
  /** Issued, written and not yet honoured. */
  'OUTSTANDING',
  /** Issued, the money left. Settled — but a bank can still return it. */
  'PAID',
  /** Either direction: karşılıksız. Final. */
  'BOUNCED',
  /** Either direction: withdrawn before it settled. Final. */
  'CANCELLED',
] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

/** Where an instrument starts, which depends entirely on the direction. */
export const INITIAL_STATUS: Record<ChequeDirection, ChequeStatus> = {
  RECEIVED: 'PORTFOLIO',
  ISSUED: 'OUTSTANDING',
};

/**
 * The transition table, per direction.
 *
 * An empty array is a final state. Read down the column to see the whole
 * lifecycle:
 *
 *   RECEIVED   PORTFOLIO -> PRESENTED -> CLEARED -> BOUNCED
 *                                     -> BOUNCED
 *              PORTFOLIO -> BOUNCED      (presented by someone else, returned)
 *              PORTFOLIO -> CANCELLED
 *
 *   ISSUED     OUTSTANDING -> PAID -> BOUNCED
 *                          -> BOUNCED
 *                          -> CANCELLED
 *
 * PORTFOLIO -> BOUNCED without a PRESENTED step is deliberate: a business does
 * not always record the presentation, and learning that a cheque came back is
 * common enough that forcing two clicks to record it would mean it is recorded
 * as something else instead.
 */
const ALLOWED_TRANSITIONS: Record<ChequeDirection, Record<string, ChequeStatus[]>> = {
  RECEIVED: {
    PORTFOLIO: ['PRESENTED', 'BOUNCED', 'CANCELLED'],
    PRESENTED: ['CLEARED', 'BOUNCED'],
    // A cleared cheque can still come back: see "Settled is not the same as
    // final" above. The route deletes the payment the clear created and
    // re-derives the invoice, so the document returns to what it owed.
    CLEARED: ['BOUNCED'],
    BOUNCED: [],
    CANCELLED: [],
    // Not reachable for this direction; listed so a mis-set row is inert
    // rather than throwing.
    OUTSTANDING: [],
    PAID: [],
  },
  ISSUED: {
    OUTSTANDING: ['PAID', 'BOUNCED', 'CANCELLED'],
    // Symmetric: our own cheque was marked paid and the bank returned it.
    PAID: ['BOUNCED'],
    BOUNCED: [],
    CANCELLED: [],
    PORTFOLIO: [],
    PRESENTED: [],
  },
};

/**
 * Statuses in which an instrument is no longer live.
 *
 * What "held in portfolio" excludes, and what freezes a record against editing:
 * the amount of a cheque that has already produced a payment is history.
 * A settled instrument is not necessarily finished — see FINAL_STATUSES.
 */
export const SETTLED_STATUSES = ['CLEARED', 'PAID', 'BOUNCED', 'CANCELLED'] as const;

/** Statuses an instrument can never leave, whatever happens next. */
export const FINAL_STATUSES = ['BOUNCED', 'CANCELLED'] as const;

/**
 * The two statuses that mean money actually moved.
 *
 * Reaching one creates a Payment; leaving one for BOUNCED deletes it again.
 *
 * These are the only points in either lifecycle at which any figure in the
 * product changes, and even then the instrument does not change it: reaching
 * one causes the route to create a `Payment`, and every existing total —
 * Outstanding, Receivables, the statements, the reports — goes on being derived
 * from Payment rows exactly as it was. Nothing writes a status onto an invoice.
 */
export const SETTLING_STATUSES = ['CLEARED', 'PAID'] as const;

export function isChequeDirection(value: unknown): value is ChequeDirection {
  return typeof value === 'string' && (CHEQUE_DIRECTIONS as readonly string[]).includes(value);
}

export function isChequeInstrument(value: unknown): value is ChequeInstrumentType {
  return typeof value === 'string' && (CHEQUE_INSTRUMENTS as readonly string[]).includes(value);
}

export function isChequeStatus(value: unknown): value is ChequeStatus {
  return typeof value === 'string' && (CHEQUE_STATUSES as readonly string[]).includes(value);
}

/** True when an instrument has left the drawer — settled, bounced or cancelled. */
export function isSettled(status: unknown): boolean {
  return typeof status === 'string' && (SETTLED_STATUSES as readonly string[]).includes(status);
}

/** True when no further transition is possible from here. */
export function isFinal(status: unknown): boolean {
  return typeof status === 'string' && (FINAL_STATUSES as readonly string[]).includes(status);
}

/** True when reaching this status means money moved. */
export function isSettling(status: unknown): boolean {
  return typeof status === 'string' && (SETTLING_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether an instrument in this direction may move from `from` to `to`.
 *
 * Refuses anything the table above does not name, including a move to the state
 * it is already in — a no-op transition would let a screen "record" a bounce
 * twice and create two of whatever the caller does on success.
 */
export function canTransition(
  direction: unknown,
  from: unknown,
  to: unknown
): boolean {
  if (!isChequeDirection(direction)) return false;
  if (typeof from !== 'string' || !isChequeStatus(to)) return false;
  return ALLOWED_TRANSITIONS[direction][from]?.includes(to) ?? false;
}

/** Every status an instrument could legally move to next. Empty when terminal. */
export function nextStatuses(direction: unknown, from: unknown): ChequeStatus[] {
  if (!isChequeDirection(direction) || typeof from !== 'string') return [];
  return [...(ALLOWED_TRANSITIONS[direction][from] ?? [])];
}

/** Statuses this direction can ever hold, for a filter dropdown. */
export function statusesForDirection(direction: unknown): ChequeStatus[] {
  if (!isChequeDirection(direction)) return [...CHEQUE_STATUSES];
  const table = ALLOWED_TRANSITIONS[direction];
  const reachable = new Set<ChequeStatus>([INITIAL_STATUS[direction]]);
  // Walk the table rather than hand-listing, so this cannot drift from it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const status of [...reachable]) {
      for (const next of table[status] ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          grew = true;
        }
      }
    }
  }
  return [...reachable];
}

/**
 * Whether an instrument is still live — neither settled nor written off.
 *
 * This is what "held in portfolio" means for the totals: PORTFOLIO and
 * PRESENTED for a received instrument, OUTSTANDING for an issued one. A cleared
 * cheque is not held even though it can still bounce.
 */
export function isOpen(status: unknown): boolean {
  return isChequeStatus(status) && !isSettled(status);
}

/** Display labels. The stored value is never translated; only these are. */
export const CHEQUE_STATUS_LABEL_KEYS: Record<ChequeStatus, TranslationKey> = {
  PORTFOLIO: 'cheques.statusPortfolio',
  PRESENTED: 'cheques.statusPresented',
  CLEARED: 'cheques.statusCleared',
  OUTSTANDING: 'cheques.statusOutstanding',
  PAID: 'cheques.statusPaid',
  BOUNCED: 'cheques.statusBounced',
  CANCELLED: 'cheques.statusCancelled',
};

export const CHEQUE_DIRECTION_LABEL_KEYS: Record<ChequeDirection, TranslationKey> = {
  RECEIVED: 'cheques.directionReceived',
  ISSUED: 'cheques.directionIssued',
};

export const CHEQUE_INSTRUMENT_LABEL_KEYS: Record<ChequeInstrumentType, TranslationKey> = {
  CHEQUE: 'cheques.instrumentCheque',
  PROMISSORY_NOTE: 'cheques.instrumentNote',
};

/** Badge colours, in the same shape `lib/invoice-helpers.ts` uses. */
export const CHEQUE_STATUS_COLORS: Record<ChequeStatus, string> = {
  PORTFOLIO: 'bg-blue-100 text-blue-700',
  PRESENTED: 'bg-indigo-100 text-indigo-700',
  CLEARED: 'bg-green-100 text-green-700',
  OUTSTANDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  BOUNCED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

/** Presentation for a stored status, matching on the value and never a label. */
export function getChequeStatusBadge(status: unknown): {
  value: ChequeStatus;
  labelKey: TranslationKey;
  color: string;
} {
  const value: ChequeStatus = isChequeStatus(status) ? status : 'PORTFOLIO';
  return {
    value,
    labelKey: CHEQUE_STATUS_LABEL_KEYS[value],
    color: CHEQUE_STATUS_COLORS[value],
  };
}

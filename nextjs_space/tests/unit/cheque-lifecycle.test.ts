import { describe, it, expect } from 'vitest';
import {
  CHEQUE_DIRECTIONS,
  CHEQUE_STATUSES,
  CHEQUE_STATUS_LABEL_KEYS,
  INITIAL_STATUS,
  SETTLING_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  getChequeStatusBadge,
  isChequeDirection,
  isChequeInstrument,
  isChequeStatus,
  isOpen,
  isSettling,
  isTerminal,
  nextStatuses,
  statusesForDirection,
  type ChequeStatus,
} from '@/lib/cheque-status';
import { en } from '@/lib/i18n/en';
import { tr } from '@/lib/i18n/tr';

/**
 * The lifecycle of a cheque or promissory note.
 *
 * A post-dated cheque is a primary settlement instrument for a Turkish small
 * business, and until it clears it is neither cash nor a plain receivable. The
 * whole feature rests on that distinction, so the state machine is tested the
 * way `lib/invoice-status.ts` is — as pure logic, with no database anywhere
 * near it.
 *
 * The property that matters most: **an instrument in the drawer is a promise.**
 * Nothing in PORTFOLIO, PRESENTED or OUTSTANDING may be counted as money.
 */

describe('the shape of the lifecycle', () => {
  it('starts a received instrument in the portfolio and an issued one outstanding', () => {
    expect(INITIAL_STATUS.RECEIVED).toBe('PORTFOLIO');
    expect(INITIAL_STATUS.ISSUED).toBe('OUTSTANDING');
  });

  it('names four terminal states', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['BOUNCED', 'CANCELLED', 'CLEARED', 'PAID']);
  });

  it('treats exactly the two settling states as money', () => {
    expect([...SETTLING_STATUSES].sort()).toEqual(['CLEARED', 'PAID']);
    for (const status of CHEQUE_STATUSES) {
      expect(isSettling(status), status).toBe(
        (SETTLING_STATUSES as readonly string[]).includes(status)
      );
    }
  });

  it('narrows values rather than trusting them', () => {
    for (const value of [null, undefined, '', 'received', 'Cheque', 7, {}]) {
      expect(isChequeDirection(value)).toBe(false);
      expect(isChequeInstrument(value)).toBe(false);
      expect(isChequeStatus(value)).toBe(false);
    }
    expect(isChequeDirection('RECEIVED')).toBe(true);
    expect(isChequeInstrument('PROMISSORY_NOTE')).toBe(true);
    expect(isChequeStatus('BOUNCED')).toBe(true);
  });
});

describe('a received cheque', () => {
  it('goes portfolio, presented, cleared', () => {
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'PRESENTED')).toBe(true);
    expect(canTransition('RECEIVED', 'PRESENTED', 'CLEARED')).toBe(true);
  });

  it('can bounce from presented — the case that costs money', () => {
    expect(canTransition('RECEIVED', 'PRESENTED', 'BOUNCED')).toBe(true);
  });

  it('can bounce straight from the portfolio', () => {
    // A business does not always record the presentation. Forcing two clicks
    // to record a bounce would mean it gets recorded as something else.
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'BOUNCED')).toBe(true);
  });

  it('can be cancelled while it is still in the drawer, but not after', () => {
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'CANCELLED')).toBe(true);
    expect(canTransition('RECEIVED', 'PRESENTED', 'CANCELLED')).toBe(false);
  });

  it('cannot skip presentation and clear itself', () => {
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'CLEARED')).toBe(false);
  });

  it('never reaches a status belonging to the other direction', () => {
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'PAID')).toBe(false);
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'OUTSTANDING')).toBe(false);
    expect(statusesForDirection('RECEIVED')).not.toContain('PAID');
    expect(statusesForDirection('RECEIVED')).not.toContain('OUTSTANDING');
  });
});

describe('an issued cheque', () => {
  it('goes outstanding, then paid', () => {
    expect(canTransition('ISSUED', 'OUTSTANDING', 'PAID')).toBe(true);
  });

  it('can bounce — our own cheque came back', () => {
    expect(canTransition('ISSUED', 'OUTSTANDING', 'BOUNCED')).toBe(true);
  });

  it('can be cancelled while outstanding', () => {
    expect(canTransition('ISSUED', 'OUTSTANDING', 'CANCELLED')).toBe(true);
  });

  it('has no presentation step, because presenting is the holder’s act', () => {
    expect(canTransition('ISSUED', 'OUTSTANDING', 'PRESENTED')).toBe(false);
    expect(statusesForDirection('ISSUED')).not.toContain('PRESENTED');
    expect(statusesForDirection('ISSUED')).not.toContain('PORTFOLIO');
  });
});

describe('terminal states stay terminal', () => {
  it('lets nothing leave a terminal state, in either direction', () => {
    for (const direction of CHEQUE_DIRECTIONS) {
      for (const from of TERMINAL_STATUSES) {
        for (const to of CHEQUE_STATUSES) {
          expect(canTransition(direction, from, to), `${direction} ${from}->${to}`).toBe(false);
        }
        expect(nextStatuses(direction, from)).toEqual([]);
      }
    }
  });

  it('reports a bounced instrument as closed, not open', () => {
    expect(isTerminal('BOUNCED')).toBe(true);
    expect(isOpen('BOUNCED')).toBe(false);
  });

  it('reports a live instrument as open', () => {
    for (const status of ['PORTFOLIO', 'PRESENTED', 'OUTSTANDING']) {
      expect(isOpen(status), status).toBe(true);
      expect(isTerminal(status), status).toBe(false);
    }
  });
});

describe('canTransition refuses anything it was not told about', () => {
  it('refuses a move to the state it is already in', () => {
    // A no-op transition would let a screen record a bounce twice and do
    // whatever it does on success twice with it.
    for (const direction of CHEQUE_DIRECTIONS) {
      for (const status of CHEQUE_STATUSES) {
        expect(canTransition(direction, status, status), `${direction} ${status}`).toBe(false);
      }
    }
  });

  it('refuses an unknown direction, status or target', () => {
    expect(canTransition('SIDEWAYS', 'PORTFOLIO', 'CLEARED')).toBe(false);
    expect(canTransition('RECEIVED', 'INVENTED', 'CLEARED')).toBe(false);
    expect(canTransition('RECEIVED', 'PORTFOLIO', 'INVENTED')).toBe(false);
    expect(canTransition(null, null, null)).toBe(false);
    expect(canTransition(undefined, undefined, undefined)).toBe(false);
  });

  it('never throws, whatever it is handed', () => {
    for (const value of [null, undefined, 0, {}, [], 'x']) {
      expect(() => canTransition(value, value, value)).not.toThrow();
      expect(() => nextStatuses(value, value)).not.toThrow();
      expect(() => statusesForDirection(value)).not.toThrow();
    }
  });
});

describe('reachability', () => {
  it('walks the table rather than hand-listing, so the two cannot drift', () => {
    expect([...statusesForDirection('RECEIVED')].sort()).toEqual([
      'BOUNCED', 'CANCELLED', 'CLEARED', 'PORTFOLIO', 'PRESENTED',
    ]);
    expect([...statusesForDirection('ISSUED')].sort()).toEqual([
      'BOUNCED', 'CANCELLED', 'OUTSTANDING', 'PAID',
    ]);
  });

  it('offers every status when no direction is chosen, for an unfiltered list', () => {
    expect(statusesForDirection(null).sort()).toEqual([...CHEQUE_STATUSES].sort());
  });

  it('reaches every terminal state from the initial one, in both directions', () => {
    for (const direction of CHEQUE_DIRECTIONS) {
      const reachable = statusesForDirection(direction);
      expect(reachable).toContain('BOUNCED');
      expect(reachable).toContain('CANCELLED');
      expect(reachable).toContain(direction === 'RECEIVED' ? 'CLEARED' : 'PAID');
    }
  });
});

describe('presentation never leaks into the stored value', () => {
  it('resolves a badge by the stored status', () => {
    for (const status of CHEQUE_STATUSES) {
      expect(getChequeStatusBadge(status).value).toBe(status);
    }
  });

  it('falls back to the portfolio rather than throwing on nonsense', () => {
    expect(getChequeStatusBadge('nonsense').value).toBe('PORTFOLIO');
    expect(getChequeStatusBadge(null).value).toBe('PORTFOLIO');
  });

  it('gives every status a label both dictionaries carry', () => {
    for (const status of CHEQUE_STATUSES) {
      const key = CHEQUE_STATUS_LABEL_KEYS[status as ChequeStatus];
      expect(en[key], status).toBeTruthy();
      expect(tr[key], status).toBeTruthy();
    }
  });

  it('never shows the stored value as its own Turkish label', () => {
    for (const status of CHEQUE_STATUSES) {
      expect(tr[CHEQUE_STATUS_LABEL_KEYS[status as ChequeStatus]]).not.toBe(status);
    }
  });
});

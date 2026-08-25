import { describe, it, expect } from 'vitest';
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventRangeSchema,
  EVENT_TYPES,
  EVENT_STATUSES,
} from '@/lib/validation';
import { optionalText, optionalDate } from '@/lib/event-fields';

/**
 * Calendar event tests.
 *
 * These cover the validation and field-shaping logic the event routes depend
 * on. Route-level authorization — that one company cannot read or modify
 * another's events — is enforced by scoping every query to the session's
 * companyId and needs a live database to exercise end to end; that belongs in
 * the integration suite. What is asserted here is the property that makes the
 * scoping work: companyId is not something a client can supply.
 */

const validEvent = {
  title: 'Client meeting',
  startAt: '2026-08-25T10:00:00.000Z',
};

describe('event creation validation', () => {
  it('accepts the minimum: a title and a start time', () => {
    expect(eventCreateSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects a missing or blank title', () => {
    expect(eventCreateSchema.safeParse({ startAt: validEvent.startAt }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...validEvent, title: '' }).success).toBe(false);
  });

  it('rejects a missing start time', () => {
    expect(eventCreateSchema.safeParse({ title: 'No date' }).success).toBe(false);
  });

  it('rejects an unparseable start time instead of passing it to the database', () => {
    // `new Date('not a date')` yields Invalid Date, which surfaces as a 500
    // from Prisma rather than a 400 to the caller.
    const result = eventCreateSchema.safeParse({ ...validEvent, startAt: 'not a date' });
    expect(result.success).toBe(false);
  });

  it('accepts an end time after the start', () => {
    const result = eventCreateSchema.safeParse({
      ...validEvent,
      endAt: '2026-08-25T11:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an end time before the start', () => {
    const result = eventCreateSchema.safeParse({
      ...validEvent,
      endAt: '2026-08-25T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('endAt');
    }
  });

  it('accepts an end time equal to the start (a zero-length entry)', () => {
    const result = eventCreateSchema.safeParse({ ...validEvent, endAt: validEvent.startAt });
    expect(result.success).toBe(true);
  });

  it('treats an empty end time as "not set" rather than invalid', () => {
    expect(eventCreateSchema.safeParse({ ...validEvent, endAt: '' }).success).toBe(true);
  });

  it('accepts every documented event type and rejects anything else', () => {
    for (const type of EVENT_TYPES) {
      expect(eventCreateSchema.safeParse({ ...validEvent, type }).success).toBe(true);
    }
    expect(eventCreateSchema.safeParse({ ...validEvent, type: 'PARTY' }).success).toBe(false);
  });

  it('accepts every documented status and rejects anything else', () => {
    for (const status of EVENT_STATUSES) {
      expect(eventCreateSchema.safeParse({ ...validEvent, status }).success).toBe(true);
    }
    expect(eventCreateSchema.safeParse({ ...validEvent, status: 'MAYBE' }).success).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(eventCreateSchema.safeParse({ ...validEvent, amount: -5 }).success).toBe(false);
  });

  it('accepts zero and positive amounts', () => {
    expect(eventCreateSchema.safeParse({ ...validEvent, amount: 0 }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...validEvent, amount: 1250.5 }).success).toBe(true);
  });

  it('rejects a non-finite amount', () => {
    expect(eventCreateSchema.safeParse({ ...validEvent, amount: Number.NaN }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...validEvent, amount: Infinity }).success).toBe(false);
  });

  it('restricts currency to the supported set', () => {
    for (const currency of ['USD', 'EUR', 'GBP', 'TRY']) {
      expect(eventCreateSchema.safeParse({ ...validEvent, currency }).success).toBe(true);
    }
    expect(eventCreateSchema.safeParse({ ...validEvent, currency: 'XYZ' }).success).toBe(false);
  });

  it('rejects a title longer than the column allows', () => {
    expect(eventCreateSchema.safeParse({ ...validEvent, title: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('tenant boundary cannot be crossed through the request body', () => {
  it('drops companyId if a client sends one', () => {
    const result = eventCreateSchema.safeParse({ ...validEvent, companyId: 'another-company' });
    expect(result.success).toBe(true);
    // The field is not in the schema, so Zod strips it and the route uses the
    // session's companyId instead. A client cannot choose whose calendar it
    // writes to.
    expect(result.success && 'companyId' in result.data).toBe(false);
  });

  it('drops createdById if a client sends one', () => {
    const result = eventCreateSchema.safeParse({ ...validEvent, createdById: 'someone-else' });
    expect(result.success && 'createdById' in result.data).toBe(false);
  });

  it('drops source so a manual entry cannot pose as system-generated', () => {
    const result = eventCreateSchema.safeParse({ ...validEvent, source: 'DERIVED' });
    expect(result.success && 'source' in result.data).toBe(false);
  });

  it('also strips these on update', () => {
    const result = eventUpdateSchema.safeParse({
      title: 'Renamed',
      companyId: 'another-company',
      source: 'DERIVED',
    });
    expect(result.success).toBe(true);
    expect(result.success && 'companyId' in result.data).toBe(false);
    expect(result.success && 'source' in result.data).toBe(false);
  });
});

describe('event update validation', () => {
  it('accepts a partial update', () => {
    expect(eventUpdateSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
    expect(eventUpdateSchema.safeParse({ status: 'DONE' }).success).toBe(true);
  });

  it('accepts an empty body as a no-op', () => {
    expect(eventUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('still rejects a blank title when one is supplied', () => {
    expect(eventUpdateSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('applies the ordering rule when both ends are supplied', () => {
    expect(
      eventUpdateSchema.safeParse({
        startAt: '2026-08-25T10:00:00.000Z',
        endAt: '2026-08-25T09:00:00.000Z',
      }).success
    ).toBe(false);
  });

  it('allows clearing an optional relation with an empty string', () => {
    expect(eventUpdateSchema.safeParse({ customerId: '' }).success).toBe(true);
    expect(eventUpdateSchema.safeParse({ invoiceId: '' }).success).toBe(true);
  });
});

describe('optional field shaping', () => {
  it('distinguishes "clear this" from "leave it alone"', () => {
    // Empty string clears the column; undefined tells Prisma to skip the field.
    expect(optionalText('')).toBeNull();
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText('hello')).toBe('hello');
  });

  it('applies the same rule to dates', () => {
    expect(optionalDate('')).toBeNull();
    expect(optionalDate(undefined)).toBeUndefined();
    const d = optionalDate('2026-08-25T10:00:00.000Z');
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString()).toBe('2026-08-25T10:00:00.000Z');
  });
});

describe('calendar range filter', () => {
  it('accepts a from/to window', () => {
    const result = eventRangeSchema.safeParse({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an open-ended or absent window', () => {
    expect(eventRangeSchema.safeParse({}).success).toBe(true);
    expect(eventRangeSchema.safeParse({ from: '2026-08-01T00:00:00.000Z' }).success).toBe(true);
  });

  it('rejects an unparseable boundary', () => {
    expect(eventRangeSchema.safeParse({ from: 'last tuesday' }).success).toBe(false);
  });
});

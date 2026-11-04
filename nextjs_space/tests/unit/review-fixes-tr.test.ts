import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { rollForward } from '@/lib/recurring';
import { vatPeriod } from '@/lib/vat-report';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('recurring templates do not back-fill', () => {
  const template = { nextRunDate: '2026-01-15T00:00:00.000Z', frequency: 'MONTHLY', dayOfMonth: 15 };

  it('a resumed template carries on from today', () => {
    expect(rollForward(template, new Date('2026-07-20T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(rollForward(template, new Date('2026-07-15T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('a date already in the future is left alone', () => {
    expect(rollForward({ ...template, nextRunDate: '2026-12-15' }, new Date('2026-07-20')).toISOString().slice(0, 10)).toBe(
      '2026-12-15'
    );
  });

  it('the PUT route rolls forward on resume and ends a template whose end date passed', () => {
    const route = src('app/api/recurring-invoices/[id]/route.ts');
    expect(route).toContain('rollForward(existing, new Date())');
    expect(route).toContain('isActive: endsBeforeNextRun ? false');
  });

  it('only the current period is emailed automatically', () => {
    const jobs = src('lib/cron/jobs.ts');
    expect(jobs).toContain('template.autoSend && isCurrentPeriod');
  });
});

describe('quotes', () => {
  it('a quote whose invoice was deleted can be converted again', () => {
    const route = src('app/api/quotes/[id]/convert/route.ts');
    expect(route).toContain('convertedAt: quote.convertedAt');
    expect(route).not.toContain('convertedAt: null }');
  });

  it('a draft edit cannot make the quote expire before its date', () => {
    expect(src('app/api/quotes/[id]/route.ts')).toContain("code: 'VALID_BEFORE_ISSUE'");
  });

  it('lines come back in the order they were entered', () => {
    for (const file of [
      'app/api/quotes/[id]/convert/route.ts',
      'app/api/quotes/[id]/pdf/route.ts',
      'app/api/quotes/[id]/send/route.ts',
      'app/api/quotes/[id]/route.ts',
    ]) {
      expect(src(file), file).toMatch(/items: \{ orderBy: \{ id: 'asc'/);
    }
  });
});

describe('downloads and exports', () => {
  it('the invoice PDF keeps its number in the file name', () => {
    expect(src('app/(app)/invoices/[id]/page.tsx')).toContain(".replace(/[^\\w.-]+/g, '_')");
  });

  it('blob URLs are revoked after the download has started', () => {
    const lib = src('lib/bulk-pdf.ts');
    expect(lib).not.toMatch(/anchor\.click\(\);\s*URL\.revokeObjectURL/);
    expect(lib).toContain('setTimeout(() => URL.revokeObjectURL(url)');
  });

  it('an export with only an end date covers everything up to it', () => {
    const period = vatPeriod('1900-01-01', '2026-06-30', new Date('2026-11-04'));
    expect(period).not.toBeNull();
    expect(period!.lt.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(vatPeriod('2026-01-01', '9999-12-30')).not.toBeNull();
    expect(src('app/api/export/[dataset]/route.ts')).toContain("vatPeriod(from ?? '1900-01-01', to ?? '9999-12-30')");
  });

  it('expense and income forms start in the company currency', () => {
    for (const file of ['app/(app)/expenses/page.tsx', 'app/(app)/income/page.tsx']) {
      expect(src(file), file).toContain("currency: company?.defaultCurrency ?? 'USD'");
    }
  });
});

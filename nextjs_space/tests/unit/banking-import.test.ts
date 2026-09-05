import { describe, it, expect } from 'vitest';
import {
  assignExternalIds,
  detectDelimiter,
  importFromCsv,
  mapHeaders,
  normalizeRow,
  parseCsv,
  parseDirection,
  parseMoney,
  parseStatementDate,
} from '@/lib/banking/import';

/**
 * Statement import.
 *
 * Every bank exports a slightly different file, so the parsing here is the part
 * most likely to meet input nobody anticipated. Two properties are load-bearing:
 * a row that cannot be read must be reported rather than guessed at, and
 * importing the same statement twice must not double the books.
 */

const OPTIONS = { defaultCurrency: 'USD', allowedCurrencies: ['USD', 'EUR', 'GBP', 'TRY'] };

describe('CSV parsing', () => {
  it('reads a plain comma-separated file', () => {
    const rows = parseCsv('Date,Description,Amount\n2026-09-01,Rent,-850.00');
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-09-01', 'Rent', '-850.00'],
    ]);
  });

  it('keeps a delimiter that sits inside a quoted field', () => {
    const rows = parseCsv('Date,Description,Amount\n2026-09-01,"Acme, Ltd. invoice",1200.00');
    expect(rows[1][1]).toBe('Acme, Ltd. invoice');
  });

  it('reads a doubled quote as a literal quote', () => {
    const rows = parseCsv('A,B\n1,"say ""hello"""');
    expect(rows[1][1]).toBe('say "hello"');
  });

  it('handles a newline inside a quoted field', () => {
    const rows = parseCsv('A,B\n1,"line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('line one\nline two');
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('A,B\r\n1,2\r\n');
    expect(rows).toEqual([['A', 'B'], ['1', '2']]);
  });

  it('strips the BOM Excel writes, so the first header is still recognised', () => {
    // Without this the first column reads as "﻿Date" and the date column
    // is never found — the whole import fails on an invisible character.
    const rows = parseCsv('﻿Date,Amount\n2026-09-01,10');
    expect(rows[0][0]).toBe('Date');
    expect(mapHeaders(rows[0]).date).toBe(0);
  });

  it('detects a semicolon-delimited European export', () => {
    expect(detectDelimiter('Tarih;Aciklama;Tutar')).toBe(';');
    const rows = parseCsv('Tarih;Aciklama;Tutar\n01.09.2026;Kira;-850,00');
    expect(rows[1]).toEqual(['01.09.2026', 'Kira', '-850,00']);
  });

  it('does not let commas in the header text outvote the real delimiter', () => {
    expect(detectDelimiter('Date;"Description, full";Amount')).toBe(';');
  });

  it('returns nothing for empty input rather than a phantom row', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n  ')).toEqual([]);
  });
});

describe('header mapping', () => {
  it('ignores case, spacing and punctuation', () => {
    const map = mapHeaders(['Transaction Date', 'DESCRIPTION', 'amount_gbp']);
    expect(map.date).toBe(0);
    expect(map.description).toBe(1);
  });

  it('recognises Turkish column names', () => {
    // Accents are folded to their base letter rather than stripped: stripping
    // turns "Açıklama" into "aklama", which matches no alias, so a Turkish
    // export would import with no description column at all.
    const map = mapHeaders(['Tarih', 'Açıklama', 'Tutar', 'Bakiye']);
    expect(map.date).toBe(0);
    expect(map.description).toBe(1);
    expect(map.amount).toBe(2);
    expect(map.balance).toBe(3);
  });

  it('recognises a Turkish header written with the dotted capital İ', () => {
    const map = mapHeaders(['İşlem Tarihi', 'İşlem Tutarı']);
    expect(map.date).toBe(0);
  });

  it('reports -1 for a column the file does not have', () => {
    expect(mapHeaders(['Date', 'Amount']).reference).toBe(-1);
  });
});

describe('money parsing', () => {
  it('reads the anglophone convention', () => {
    expect(parseMoney('1,234.56')).toBe(1234.56);
    expect(parseMoney('$1,234.56')).toBe(1234.56);
  });

  it('reads the continental convention', () => {
    // The bug this prevents: reading "1.234,56" as 1.234 and importing a
    // thousand-lira transfer as one lira twenty-three.
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('₺1.234,56')).toBe(1234.56);
  });

  it('decides a lone separator by how many digits follow it', () => {
    expect(parseMoney('1,234')).toBe(1234);  // thousands group
    expect(parseMoney('1,23')).toBe(1.23);   // decimal comma
    expect(parseMoney('1.234')).toBe(1234);
    expect(parseMoney('1.23')).toBe(1.23);
  });

  it('reads accounting notation for a negative', () => {
    expect(parseMoney('(850.00)')).toBe(-850);
    expect(parseMoney('850.00-')).toBe(-850);
    expect(parseMoney('-850.00')).toBe(-850);
  });

  it('returns null rather than NaN for something unreadable', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('n/a')).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it('keeps zero distinguishable from unreadable', () => {
    expect(parseMoney('0.00')).toBe(0);
    expect(parseMoney('0')).toBe(0);
  });
});

describe('date parsing', () => {
  it('reads ISO dates', () => {
    expect(parseStatementDate('2026-09-01')).toBe('2026-09-01');
    expect(parseStatementDate('2026/09/01')).toBe('2026-09-01');
  });

  it('reads day-first dates, which is what both shipped locales write', () => {
    expect(parseStatementDate('01.09.2026')).toBe('2026-09-01');
    expect(parseStatementDate('1/9/2026')).toBe('2026-09-01');
  });

  it('rejects a day that does not exist rather than rolling it forward', () => {
    // new Date(2026, 1, 31) silently becomes 3 March. A wrong date ruins the
    // date-proximity half of the matcher, so it is refused instead.
    expect(parseStatementDate('31.02.2026')).toBeNull();
    expect(parseStatementDate('2026-13-01')).toBeNull();
  });

  it('returns null for anything it cannot read', () => {
    expect(parseStatementDate('last Tuesday')).toBeNull();
    expect(parseStatementDate('')).toBeNull();
  });
});

describe('direction', () => {
  it('reads the words banks actually use', () => {
    expect(parseDirection('Credit')).toBe('CREDIT');
    expect(parseDirection('DR')).toBe('DEBIT');
    expect(parseDirection('Alacak')).toBe('CREDIT');
    expect(parseDirection('Borç')).toBe('DEBIT');
  });

  it('returns null for a value that says nothing useful', () => {
    expect(parseDirection('transfer')).toBeNull();
    expect(parseDirection('')).toBeNull();
  });
});

describe('row normalisation', () => {
  it('reads a negative amount as money out', () => {
    const { row } = normalizeRow(
      { date: '2026-09-01', description: 'Office rent', amount: '-850.00' },
      OPTIONS
    );
    expect(row).toMatchObject({ amount: 850, direction: 'DEBIT' });
  });

  it('reads a positive amount as money in', () => {
    const { row } = normalizeRow(
      { date: '2026-09-01', description: 'Deposit', amount: '1200.00' },
      OPTIONS
    );
    expect(row).toMatchObject({ amount: 1200, direction: 'CREDIT' });
  });

  it('reads separate debit and credit columns', () => {
    const debit = normalizeRow(
      { date: '2026-09-01', description: 'Rent', debit: '850.00', credit: '' },
      OPTIONS
    );
    expect(debit.row).toMatchObject({ amount: 850, direction: 'DEBIT' });

    const credit = normalizeRow(
      { date: '2026-09-01', description: 'Deposit', debit: '', credit: '1200.00' },
      OPTIONS
    );
    expect(credit.row).toMatchObject({ amount: 1200, direction: 'CREDIT' });
  });

  it('rejects a row that fills both the debit and the credit column', () => {
    const { row, error } = normalizeRow(
      { date: '2026-09-01', description: 'Odd', debit: '10', credit: '20' },
      OPTIONS
    );
    expect(row).toBeNull();
    expect(error).toMatch(/both a debit and a credit/i);
  });

  it('lets an explicit direction column override the sign', () => {
    // Some exports write every amount positive and put the sign in a "type"
    // column; trusting the sign there would flip every withdrawal.
    const { row } = normalizeRow(
      { date: '2026-09-01', description: 'ATM', amount: '100.00', direction: 'Debit' },
      OPTIONS
    );
    expect(row).toMatchObject({ amount: 100, direction: 'DEBIT' });
  });

  it('falls back to the account currency when the row has none', () => {
    const { row } = normalizeRow(
      { date: '2026-09-01', description: 'Deposit', amount: '10' },
      { ...OPTIONS, defaultCurrency: 'TRY' }
    );
    expect(row?.currency).toBe('TRY');
  });

  it('rejects a currency the application cannot handle', () => {
    const { row, error } = normalizeRow(
      { date: '2026-09-01', description: 'Deposit', amount: '10', currency: 'JPY' },
      OPTIONS
    );
    expect(row).toBeNull();
    expect(error).toMatch(/JPY/);
  });

  it('rejects a zero amount, a missing description and an unreadable date', () => {
    expect(normalizeRow({ date: '2026-09-01', description: 'x', amount: '0' }, OPTIONS).row).toBeNull();
    expect(normalizeRow({ date: '2026-09-01', description: '  ', amount: '10' }, OPTIONS).row).toBeNull();
    expect(normalizeRow({ date: 'soon', description: 'x', amount: '10' }, OPTIONS).row).toBeNull();
  });

  it('rejects an amount larger than the column can hold', () => {
    // Beyond DECIMAL(15,2) the database rejects the write as a 500; a per-row
    // message is more use than a failed import.
    const { row, error } = normalizeRow(
      { date: '2026-09-01', description: 'x', amount: '99999999999999999' },
      OPTIONS
    );
    expect(row).toBeNull();
    expect(error).toMatch(/out of range/i);
  });
});

describe('import as a whole', () => {
  const CSV = [
    'Date,Description,Amount,Reference',
    '2026-09-01,Payment from Acme Ltd,1200.00,INV-2026-014',
    '2026-09-02,Office rent,-850.00,',
    '2026-09-03,,-10.00,',
    'nonsense,Broken row,abc,',
  ].join('\n');

  it('imports the readable rows and reports the rest with line numbers', () => {
    const { rows, errors } = importFromCsv(CSV, OPTIONS);

    // One bad row must not cost the user the other four hundred.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: 'Payment from Acme Ltd', direction: 'CREDIT' });
    expect(rows[1]).toMatchObject({ description: 'Office rent', direction: 'DEBIT' });

    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(4);
    expect(errors[1].line).toBe(5);
  });

  it('explains a file with no date column instead of importing nothing silently', () => {
    const { rows, errors } = importFromCsv('Foo,Bar\n1,2', OPTIONS);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/date column/i);
  });

  it('explains a file with no amount column', () => {
    const { rows, errors } = importFromCsv('Date,Description\n2026-09-01,Rent', OPTIONS);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/amount column/i);
  });

  it('reports an empty file', () => {
    expect(importFromCsv('', OPTIONS).errors[0].message).toMatch(/empty/i);
  });

  it('skips blank lines without calling them errors', () => {
    const { rows, errors } = importFromCsv(
      'Date,Description,Amount\n2026-09-01,Rent,-10\n\n2026-09-02,Rent,-20\n',
      OPTIONS
    );
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });
});

describe('re-importing the same statement is idempotent', () => {
  const CSV = 'Date,Description,Amount\n2026-09-01,Rent,-850.00\n2026-09-02,Deposit,1200.00';

  it('produces the same externalId for the same file every time', () => {
    // This is what makes @@unique([bankAccountId, externalId]) + skipDuplicates
    // turn a second import into a no-op instead of doubling the books.
    const first = importFromCsv(CSV, OPTIONS).rows.map((r) => r.externalId);
    const second = importFromCsv(CSV, OPTIONS).rows.map((r) => r.externalId);
    expect(first).toEqual(second);
    expect(first.every(Boolean)).toBe(true);
  });

  it('gives different ids to different transactions', () => {
    const ids = importFromCsv(CSV, OPTIONS).rows.map((r) => r.externalId);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps two genuinely identical lines distinct', () => {
    // Two identical £4.50 coffees on the same day are two real transactions.
    // Collapsing them would understate what was spent.
    const dupes = 'Date,Description,Amount\n2026-09-01,Coffee,-4.50\n2026-09-01,Coffee,-4.50';
    const ids = importFromCsv(dupes, OPTIONS).rows.map((r) => r.externalId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('gives the same pair of ids when that file is imported again', () => {
    const dupes = 'Date,Description,Amount\n2026-09-01,Coffee,-4.50\n2026-09-01,Coffee,-4.50';
    expect(importFromCsv(dupes, OPTIONS).rows.map((r) => r.externalId)).toEqual(
      importFromCsv(dupes, OPTIONS).rows.map((r) => r.externalId)
    );
  });

  it('keeps the statement its own id when the file supplies one', () => {
    const withIds = 'Date,Description,Amount,Transaction ID\n2026-09-01,Rent,-850.00,TXN-9001';
    expect(importFromCsv(withIds, OPTIONS).rows[0].externalId).toBe('TXN-9001');
  });

  it('leaves a supplied id untouched when filling in the missing ones', () => {
    const rows = assignExternalIds([
      { externalId: 'given', date: '2026-09-01', description: 'a', amount: 1, currency: 'USD', direction: 'CREDIT' },
      { date: '2026-09-01', description: 'b', amount: 2, currency: 'USD', direction: 'CREDIT' },
    ]);
    expect(rows[0].externalId).toBe('given');
    expect(rows[1].externalId).toBeTruthy();
    expect(rows[1].externalId).not.toBe('given');
  });
});

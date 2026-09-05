import type { BankDirection, NormalizedBankTransaction } from './types';

/**
 * Turning a bank statement into rows this application can store.
 *
 * Pure: no Prisma, no filesystem, no network. Everything here is decided from
 * the text that was handed in, which is what lets the whole format-guessing
 * problem be unit-tested instead of discovered in production against somebody's
 * real statement.
 *
 * Three shapes of statement are handled, because between them they cover what
 * banks actually export:
 *
 *   1. one signed `amount` column            (-120.00 is money out)
 *   2. separate `debit` and `credit` columns (one of the two is filled)
 *   3. a positive `amount` plus a `direction`/`type` column
 *
 * No CSV dependency is added. The `csv` package is already installed, but its
 * parser is stream-oriented and asynchronous; a statement is a small string
 * pasted into a dialog, and parsing it synchronously here keeps the import path
 * testable without a stream harness.
 */

// --- CSV ---------------------------------------------------------------------

/** Delimiters seen in real exports. European locales use ';' precisely because
 *  ',' is their decimal separator. */
const DELIMITERS = [',', ';', '\t', '|'] as const;

/** The byte-order mark Excel writes at the start of a UTF-8 CSV. */
const BOM = '﻿';

/**
 * Picks the delimiter by counting candidates in the header line, ignoring
 * anything inside quotes.
 *
 * Guessing from the header rather than the whole file matters: a description
 * field full of commas would otherwise outvote the real ';' delimiter.
 */
export function detectDelimiter(headerLine: string): string {
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i += 1) {
      const ch = headerLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Splits CSV text into rows of fields.
 *
 * Handles RFC-4180 quoting: quoted fields may contain the delimiter, newlines,
 * and `""` for a literal quote. A leading BOM is stripped — Excel writes one,
 * and it otherwise becomes part of the first header name, so the date column is
 * never found.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  if (input.trim() === '') return [];

  const firstBreak = input.search(/\r?\n/);
  const headerLine = firstBreak === -1 ? input : input.slice(0, firstBreak);
  const sep = delimiter ?? detectDelimiter(headerLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // A trailing newline produces one empty field; that is not a row.
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === sep) endField();
    else if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      endRow();
    } else if (ch === '\n') endRow();
    else field += ch;
  }

  // Whatever is left after the last line break.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

// --- Column mapping ----------------------------------------------------------

/** Header aliases, lowercased and stripped of punctuation. English and Turkish,
 *  since those are the two locales the product ships. */
const HEADER_ALIASES: Record<string, string[]> = {
  date: [
    'date', 'transactiondate', 'valuedate', 'postingdate', 'bookingdate',
    'tarih', 'islemtarihi', 'valortarihi',
  ],
  description: [
    'description', 'details', 'narrative', 'memo', 'payee', 'name',
    'aciklama', 'islemaciklamasi',
  ],
  amount: ['amount', 'value', 'sum', 'tutar', 'islemtutari', 'miktar'],
  debit: ['debit', 'withdrawal', 'paidout', 'moneyout', 'borc', 'cikis'],
  credit: ['credit', 'deposit', 'paidin', 'moneyin', 'alacak', 'giris'],
  direction: ['direction', 'type', 'drcr', 'debitcredit', 'islemturu', 'yon'],
  currency: ['currency', 'ccy', 'curr', 'paribirimi', 'dovizcinsi'],
  balance: ['balance', 'runningbalance', 'closingbalance', 'bakiye'],
  reference: ['reference', 'ref', 'transactionreference', 'referans', 'dekontno'],
  externalId: ['id', 'transactionid', 'externalid', 'uniqueid', 'islemno'],
};

/**
 * Lowercases and folds accents to their base letter.
 *
 * Stripping non-ASCII instead of folding it silently destroys the Turkish
 * headers this file lists as aliases: "Açıklama" would become "aklama" and
 * "Borç" would become "bor", so neither would ever match and a Turkish bank
 * export would import as a file with no description or direction column.
 *
 * NFD splits an accented letter into its base plus a combining mark, which the
 * range below removes. The dotless ı has no decomposition, so it is mapped by
 * hand; İ lowercases to "i" plus a combining dot, which NFD then handles.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Normalises a header cell so 'Transaction Date' and 'transaction_date' agree. */
function normalizeHeader(value: string): string {
  return fold(value).replace(/[^a-z0-9]/g, '');
}

/** Maps each known field to its column index, or -1 when the file has no such column. */
export function mapHeaders(header: string[]): Record<string, number> {
  const normalized = header.map(normalizeHeader);
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    map[field] = normalized.findIndex((h) => aliases.includes(h));
  }
  return map;
}

// --- Value parsing -----------------------------------------------------------

/**
 * Reads a monetary string that may be written in either convention.
 *
 * "1,234.56" and "1.234,56" are the same amount; which separator is decimal is
 * decided by whichever appears last. With only one separator present, it is a
 * decimal point only when exactly one or two digits follow — "1,234" is one
 * thousand two hundred and thirty-four, "1,23" is one and twenty-three.
 *
 * Parentheses and a trailing minus are accounting notation for a negative.
 * Returns null rather than NaN, so callers can tell "unparseable" from "zero".
 */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  let s = raw.trim();
  if (s === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith('+')) s = s.slice(1);

  // Currency symbols, codes and spaces (including the non-breaking kind Excel
  // emits) are noise around the number itself.
  s = s.replace(/[^\d.,]/g, '').trim();
  if (s === '') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let decimalSep = '';
  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.';
    const idx = lastComma !== -1 ? lastComma : lastDot;
    const trailing = s.length - idx - 1;
    // One separator with exactly 1-2 trailing digits reads as a decimal point.
    // Anything else — "1,234", "1.000.000" — is a thousands group.
    const onlyOne = s.split(sep).length === 2;
    decimalSep = onlyOne && trailing >= 1 && trailing <= 2 ? sep : '';
  }

  const groupSep = decimalSep === ',' ? '.' : ',';
  let cleaned: string;
  if (decimalSep) {
    cleaned = s.split(groupSep).join('').replace(decimalSep, '.');
  } else {
    cleaned = s.split('.').join('').split(',').join('');
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Matches the date shapes statements use. */
const ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const DMY_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;

/** Builds 'YYYY-MM-DD', rejecting values that are not a real calendar day. */
function formatDateParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalises a statement date to 'YYYY-MM-DD'.
 *
 * Day-first is assumed for the ambiguous `dd/mm/yyyy` form, because that is what
 * both locales this product ships to write. A value that cannot be read is
 * rejected as null rather than guessed at: a wrong date silently ruins the
 * date-proximity half of the matcher.
 */
export function parseStatementDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '') return null;

  const iso = ISO_DATE.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return formatDateParts(Number(y), Number(m), Number(d));
  }

  const dmy = DMY_DATE.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return formatDateParts(Number(y), Number(m), Number(d));
  }

  return null;
}

const DEBIT_WORDS = ['debit', 'dr', 'withdrawal', 'out', 'payment', 'borc', 'cikis', 'gonderilen'];
const CREDIT_WORDS = ['credit', 'cr', 'deposit', 'in', 'receipt', 'alacak', 'giris', 'gelen'];

/** Reads an explicit direction column. Null when the value says nothing useful. */
export function parseDirection(raw: unknown): BankDirection | null {
  if (typeof raw !== 'string') return null;
  const s = fold(raw.trim()).replace(/[^a-z]/g, '');
  if (s === '') return null;
  if (CREDIT_WORDS.includes(s)) return 'CREDIT';
  if (DEBIT_WORDS.includes(s)) return 'DEBIT';
  return null;
}

// --- Idempotency -------------------------------------------------------------

/** FNV-1a. Small, deterministic, dependency-free — this is a fingerprint, not a
 *  security primitive, so a 32-bit non-cryptographic hash is the right tool. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The part of the fingerprint that identifies the line, without the occurrence. */
export function fingerprintGroup(row: NormalizedBankTransaction): string {
  const parts = [
    row.date,
    row.direction,
    row.amount.toFixed(2),
    row.description.trim().toLowerCase().replace(/\s+/g, ' '),
    (row.reference ?? '').trim().toLowerCase(),
  ].join('|');
  return fnv1a(parts);
}

/**
 * A stable identifier for a line the statement did not identify itself.
 *
 * Re-importing the same file must not double every row, and the unique index is
 * on (bankAccountId, externalId) — where NULLs are distinct, so leaving it null
 * would defeat the index entirely. The fingerprint covers the fields that
 * identify a line, and `occurrence` disambiguates genuinely identical lines on
 * the same day (two identical coffees) while staying stable across re-imports,
 * because it counts occurrences within the file in order.
 */
export function fingerprint(row: NormalizedBankTransaction, occurrence: number): string {
  return `csv:${fingerprintGroup(row)}:${occurrence}`;
}

/** Assigns an externalId to every row that lacks one, keeping re-import idempotent. */
export function assignExternalIds(rows: NormalizedBankTransaction[]): NormalizedBankTransaction[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.externalId) return row;
    const group = fingerprintGroup(row);
    const occurrence = seen.get(group) ?? 0;
    seen.set(group, occurrence + 1);
    return { ...row, externalId: fingerprint(row, occurrence) };
  });
}

// --- Normalisation -----------------------------------------------------------

export interface ImportRowError {
  /** 1-based line number in the source file, counting the header. */
  line: number;
  message: string;
}

export interface ImportResult {
  rows: NormalizedBankTransaction[];
  errors: ImportRowError[];
}

export interface NormalizeOptions {
  /** Used when a row carries no currency of its own — normally the account's. */
  defaultCurrency: string;
  /** Currencies the application supports. Rows in anything else are rejected
   *  rather than silently stored under the account's currency. */
  allowedCurrencies: readonly string[];
}

/** The largest amount DECIMAL(15,2) can hold. Beyond it the database rejects the
 *  write as a 500; saying so per row is more useful than failing the import. */
const MAX_AMOUNT = 9_999_999_999_999.99;

/** Reads one raw record into a normalised line, or explains why it cannot. */
export function normalizeRow(
  record: Record<string, unknown>,
  options: NormalizeOptions
): { row: NormalizedBankTransaction; error: null } | { row: null; error: string } {
  const date = parseStatementDate(record.date);
  if (!date) return { row: null, error: 'Unrecognised or missing date' };

  const description = typeof record.description === 'string' ? record.description.trim() : '';
  if (description === '') return { row: null, error: 'Description is required' };

  // Direction and amount are decided together, because which columns are
  // present is what tells us how the sign was expressed.
  let amount: number;
  let direction: BankDirection;

  const debit = parseMoney(record.debit);
  const credit = parseMoney(record.credit);
  const hasDebit = debit !== null && debit !== 0;
  const hasCredit = credit !== null && credit !== 0;

  if (hasDebit && hasCredit) {
    return { row: null, error: 'Row has both a debit and a credit amount' };
  }

  if (hasDebit) {
    amount = Math.abs(debit as number);
    direction = 'DEBIT';
  } else if (hasCredit) {
    amount = Math.abs(credit as number);
    direction = 'CREDIT';
  } else {
    const signed = parseMoney(record.amount);
    if (signed === null) return { row: null, error: 'Unrecognised or missing amount' };
    if (signed === 0) return { row: null, error: 'Amount must not be zero' };

    // An explicit direction column wins over the sign: some exports write every
    // amount positive and put the sign in a separate "type" column.
    direction = parseDirection(record.direction) ?? (signed < 0 ? 'DEBIT' : 'CREDIT');
    amount = Math.abs(signed);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { row: null, error: 'Amount must be greater than zero' };
  }
  if (amount > MAX_AMOUNT) return { row: null, error: 'Amount is out of range' };

  const rawCurrency =
    typeof record.currency === 'string' ? record.currency.trim().toUpperCase() : '';
  const currency = rawCurrency !== '' ? rawCurrency : options.defaultCurrency;
  if (!options.allowedCurrencies.includes(currency)) {
    return { row: null, error: `Unsupported currency "${currency}"` };
  }

  const balance = parseMoney(record.balance);
  const reference =
    typeof record.reference === 'string' && record.reference.trim() !== ''
      ? record.reference.trim().slice(0, 255)
      : undefined;
  const externalId =
    typeof record.externalId === 'string' && record.externalId.trim() !== ''
      ? record.externalId.trim().slice(0, 255)
      : undefined;

  return {
    row: {
      externalId,
      date,
      description: description.slice(0, 500),
      amount: Math.round(amount * 100) / 100,
      currency,
      direction,
      balance: balance === null ? undefined : Math.round(balance * 100) / 100,
      reference,
    },
    error: null,
  };
}

/** The largest statement accepted in one request. Keeps a paste from becoming an
 *  unbounded transaction. */
export const MAX_IMPORT_ROWS = 2000;

/** Parses a CSV statement into normalised rows plus per-line errors. */
export function importFromCsv(text: string, options: NormalizeOptions): ImportResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'The file is empty' }] };
  }

  const [header, ...body] = table;
  const columns = mapHeaders(header);

  if (columns.date === -1) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'No date column found. Expected a header such as "Date".' }],
    };
  }
  if (columns.amount === -1 && columns.debit === -1 && columns.credit === -1) {
    return {
      rows: [],
      errors: [
        { line: 1, message: 'No amount column found. Expected "Amount", or "Debit" and "Credit".' },
      ],
    };
  }

  const rows: NormalizedBankTransaction[] = [];
  const errors: ImportRowError[] = [];
  let limitReported = false;

  body.forEach((cells, index) => {
    const line = index + 2; // 1-based, after the header
    if (cells.every((c) => c.trim() === '')) return; // blank line, not an error

    if (rows.length >= MAX_IMPORT_ROWS) {
      if (!limitReported) {
        limitReported = true;
        errors.push({ line, message: `Import is limited to ${MAX_IMPORT_ROWS} rows per file` });
      }
      return;
    }

    const pick = (field: string): string | undefined => {
      const at = columns[field];
      return at >= 0 ? cells[at] : undefined;
    };

    const result = normalizeRow(
      {
        date: pick('date'),
        description: pick('description'),
        amount: pick('amount'),
        debit: pick('debit'),
        credit: pick('credit'),
        direction: pick('direction'),
        currency: pick('currency'),
        balance: pick('balance'),
        reference: pick('reference'),
        externalId: pick('externalId'),
      },
      options
    );

    // Narrowed on `row` rather than on `error`: TypeScript cannot discriminate
    // the union on a `string | null` field, since '' is falsy but still a string.
    if (result.row === null) errors.push({ line, message: result.error });
    else rows.push(result.row);
  });

  return { rows: assignExternalIds(rows), errors };
}

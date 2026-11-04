import { createZip } from '@/lib/zip';

/**
 * Tables → Excel (.xlsx) and CSV. Pure, no dependency.
 *
 * XLSX is a ZIP of a few XML parts; the archive is built with lib/zip (stored,
 * which Excel, LibreOffice and Google Sheets all open). Text cells are inline
 * strings, so nothing a user typed can become a formula. Numbers stay numbers,
 * dates are real Excel dates with a date format.
 *
 * CSV is written for the reader's spreadsheet: Turkish Excel expects ";" and
 * a decimal comma, English Excel "," and a decimal point. A UTF-8 BOM keeps
 * Turkish letters readable. Cells that start with = + - @ are prefixed with
 * an apostrophe so a spreadsheet does not run them (CSV injection).
 */

export type ColumnType = 'text' | 'number' | 'money' | 'date';

export interface TableColumn {
  header: string;
  type?: ColumnType;
  width?: number;
}

export interface Table {
  /** Sheet name (max 31 characters, no : \ / ? * [ ]). */
  name: string;
  columns: TableColumn[];
  rows: unknown[][];
}

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry at all.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetName(name: string, index: number): string {
  const clean = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return clean || `Sheet${index + 1}`;
}

/** Days since 1899-12-30, Excel's date serial. */
function excelDate(value: unknown): number | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getTime() / 86400000 + 25569;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(typeof value === 'object' ? String(value) : value);
  return Number.isFinite(n) ? n : null;
}

// Style indexes in styles.xml below.
const STYLE = { text: 0, header: 1, date: 2, money: 3, number: 0 } as const;

function cellXml(ref: string, value: unknown, type: ColumnType): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') {
    const serial = excelDate(value);
    if (serial !== null) return `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`;
  }
  if (type === 'number' || type === 'money') {
    const n = toNumber(value);
    if (n !== null) return `<c r="${ref}" s="${type === 'money' ? STYLE.money : STYLE.number}"><v>${n}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function sheetXml(table: Table): string {
  const cols = table.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? (c.type === 'text' || !c.type ? 24 : 14)}" customWidth="1"/>`)
    .join('');
  const header =
    `<row r="1">` +
    table.columns
      .map((c, i) => `<c r="${columnLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.header)}</t></is></c>`)
      .join('') +
    `</row>`;
  const body = table.rows
    .map((row, r) => {
      const rowNum = r + 2;
      const cells = table.columns.map((c, i) => cellXml(`${columnLetter(i)}${rowNum}`, row[i], c.type ?? 'text')).join('');
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** One workbook, one sheet per table. */
export function buildXlsx(tables: Table[]): Uint8Array {
  const enc = new TextEncoder();
  const names = tables.map((t, i) => sheetName(t.name, i));
  const sheets = tables.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(t)) }));
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    tables
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('') +
    `</Types>`;
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    tables
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('') +
    `<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return createZip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    ...sheets,
  ]);
}

/** Neutralises a cell a spreadsheet would otherwise evaluate. */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown, type: ColumnType, locale: 'tr' | 'en', sep: string): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    text = Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  } else if (type === 'number' || type === 'money') {
    const n = toNumber(value);
    text = n === null ? '' : type === 'money' ? n.toFixed(2) : String(n);
    if (locale === 'tr') text = text.replace('.', ',');
  } else text = csvSafe(String(value));
  return /["\n\r]/.test(text) || text.includes(sep) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One table as CSV text, BOM included. */
export function buildCsv(table: Table, locale: 'tr' | 'en'): string {
  const sep = locale === 'tr' ? ';' : ',';
  const lines = [
    table.columns.map((c) => csvCell(c.header, 'text', locale, sep)).join(sep),
    ...table.rows.map((row) => table.columns.map((c, i) => csvCell(row[i], c.type ?? 'text', locale, sep)).join(sep)),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

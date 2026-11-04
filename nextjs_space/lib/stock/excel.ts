import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { buildXlsx, type Table } from '@/lib/export/tabular';
import { translate, type Locale } from '@/lib/i18n';
import { stockLevel } from './rules';
import { normalizeSpreadsheetPrefix } from './karadag-import';

/**
 * KolayStok and Excel: the stock workbook (export, nightly backup, the backup
 * taken before a reset) and the bulk upload — one template for adding
 * products and for updating stock and prices.
 */

// ---------------------------------------------------------------------------
// Stock workbook
// ---------------------------------------------------------------------------

export interface StockRow {
  code: string;
  name: string;
  categoryName?: string | null;
  size?: string | null;
  material?: string | null;
  unit: string;
  quantity: Decimal.Value;
  minStock: Decimal.Value;
  targetStock?: Decimal.Value | null;
  shelf?: string | null;
  vendorName?: string | null;
  purchasePrice?: Decimal.Value | null;
  salePrice?: Decimal.Value | null;
}

/** All stock (or the critical rows), with prices when `withPrices`. */
export function stockWorkbook(rows: StockRow[], locale: Locale, withPrices: boolean): Uint8Array {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  const n = (v: Decimal.Value | null | undefined) => (v === null || v === undefined ? null : new Decimal(v).toNumber());
  const table: Table = {
    name: t('ks.brand'),
    columns: [
      { header: t('ks.product.code') },
      { header: t('ks.product.name') },
      { header: t('ks.product.category') },
      { header: t('ks.product.size') },
      { header: t('ks.product.material') },
      { header: t('ks.product.unit') },
      { header: t('ks.product.stock'), type: 'number' },
      { header: t('ks.product.minStock'), type: 'number' },
      { header: t('ks.product.targetStock'), type: 'number' },
      { header: t('ks.xl.level') },
      { header: t('ks.product.shelf') },
      { header: t('ks.product.supplier') },
      ...(withPrices
        ? [
            { header: t('ks.product.purchasePrice'), type: 'money' as const },
            { header: t('ks.product.salePrice'), type: 'money' as const },
            { header: t('ks.product.value'), type: 'money' as const },
          ]
        : []),
    ],
    rows: rows.map((r) => [
      r.code,
      r.name,
      r.categoryName ?? '',
      r.size ?? '',
      r.material ?? '',
      r.unit,
      n(r.quantity),
      n(r.minStock),
      n(r.targetStock),
      t(`ks.level.${stockLevel(r.quantity, r.minStock)}` as any),
      r.shelf ?? '',
      r.vendorName ?? '',
      ...(withPrices
        ? [
            n(r.purchasePrice),
            n(r.salePrice),
            r.purchasePrice !== null && r.purchasePrice !== undefined ? new Decimal(r.purchasePrice).mul(r.quantity).toNumber() : null,
          ]
        : []),
    ]),
  };
  return buildXlsx([table]);
}

// ---------------------------------------------------------------------------
// Bulk upload: template, reading, checking
// ---------------------------------------------------------------------------

/** Template columns, in order. The same file adds products and updates stock/prices. */
export const IMPORT_COLUMNS = [
  'code', 'name', 'category', 'size', 'material', 'unit', 'purchasePrice', 'salePrice', 'minStock', 'targetStock', 'shelf', 'supplier', 'notes', 'stock',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const HEADER_KEYS: Record<ImportColumn, string> = {
  code: 'ks.product.code', name: 'ks.product.name', category: 'ks.product.category', size: 'ks.product.size',
  material: 'ks.product.material', unit: 'ks.product.unit', purchasePrice: 'ks.product.purchasePrice',
  salePrice: 'ks.product.salePrice', minStock: 'ks.product.minStock', targetStock: 'ks.product.targetStock',
  shelf: 'ks.product.shelf', supplier: 'ks.product.supplier', notes: 'ks.product.notes', stock: 'ks.product.stock',
};

export const IMPORT_MAX_ROWS = 5000;

export function importTemplate(locale: Locale): Uint8Array {
  return buildXlsx([
    {
      name: translate(locale, 'ks.brand'),
      columns: IMPORT_COLUMNS.map((c) => ({ header: translate(locale, HEADER_KEYS[c] as any) })),
      rows: [['PZ001', 'Alüminyum Pizza Çevirme', 'Pizza ekipmanları', '20 cm', 'Alüminyum', 'adet', '', 1320, 50, 200, 'A-1', '', '', 100]],
    },
  ]);
}

export type RawImportRow = Partial<Record<ImportColumn, string>> & { row: number };

/**
 * A cell as text. With numeric=true a real number cell is written with a
 * decimal comma ("0,125"), so the Turkish-style parser below never mistakes
 * its decimal point for a thousands dot.
 */
function text(cell: ExcelJS.Cell, numeric = false): string {
  const v: any = cell.value;
  if (v === null || v === undefined) return '';
  if (numeric && typeof v === 'number') return String(v).replace('.', ',');
  if (typeof v === 'object') {
    if ('result' in v) return numeric && typeof v.result === 'number' ? String(v.result).replace('.', ',') : String(v.result ?? '').trim();
    if ('richText' in v) return v.richText.map((r: any) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
  }
  return String(v).trim();
}

const NUMERIC_COLUMNS = new Set<ImportColumn>(['purchasePrice', 'salePrice', 'minStock', 'targetStock', 'stock'] as ImportColumn[]);

/** Reads the first sheet: the header row says which column is which (TR or EN names). */
export async function readImportSheet(buffer: Buffer): Promise<RawImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await normalizeSpreadsheetPrefix(buffer)) as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerNames = new Map<string, ImportColumn>();
  for (const locale of ['tr', 'en'] as const) {
    for (const c of IMPORT_COLUMNS) headerNames.set(translate(locale, HEADER_KEYS[c] as any).toLocaleLowerCase('tr-TR'), c);
  }
  const header = ws.getRow(1);
  const columnOf = new Map<number, ImportColumn>();
  header.eachCell((cell, col) => {
    const key = headerNames.get(text(cell).toLocaleLowerCase('tr-TR'));
    if (key) columnOf.set(col, key);
  });
  const rows: RawImportRow[] = [];
  for (let r = 2; r <= Math.min(ws.rowCount, IMPORT_MAX_ROWS + 1); r++) {
    const row = ws.getRow(r);
    const out: RawImportRow = { row: r };
    let any = false;
    for (const [col, key] of columnOf) {
      const value = text(row.getCell(col), NUMERIC_COLUMNS.has(key));
      if (value) {
        out[key] = value;
        any = true;
      }
    }
    if (any) rows.push(out);
  }
  return rows;
}

export interface CheckedRow {
  row: number;
  code: string;
  action: 'create' | 'update';
  values: {
    name?: string;
    category?: string | null;
    size?: string | null;
    material?: string | null;
    unit?: string;
    purchasePrice?: number | null;
    salePrice?: number | null;
    minStock?: number;
    targetStock?: number | null;
    shelf?: string | null;
    supplier?: string | null;
    notes?: string | null;
    stock?: number;
  };
  errors: string[];
  /** Not blocking, but shown in the preview (e.g. an unknown supplier name). */
  warnings?: Array<{ code: 'supplier:unknown'; value: string }>;
}

/**
 * Marks rows whose supplier name matches no supplier of the company. Such a
 * row keeps the product's current supplier (a new product gets none), so the
 * manager is told before confirming.
 */
export function markUnknownSuppliers<T extends Pick<CheckedRow, 'values' | 'warnings'>>(rows: T[], supplierNames: string[]): number {
  const known = new Set(supplierNames.map((n) => n.trim().toLocaleLowerCase('tr-TR')));
  let count = 0;
  for (const r of rows) {
    const name = r.values.supplier?.trim();
    if (name && !known.has(name.toLocaleLowerCase('tr-TR'))) {
      r.warnings = [...(r.warnings ?? []), { code: 'supplier:unknown', value: name }];
      count += 1;
    }
  }
  return count;
}

function number(value: string | undefined, field: string, errors: string[]): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === '' || value === '-') return null;
  const v = value.replace(/\s/g, '');
  // "1.234" / "1.234,5" → Turkish thousands dots; "12,5" → decimal comma;
  // anything else (e.g. "0.125", "12.5") is read with a decimal point.
  const n = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(v)
    ? Number(v.replace(/\./g, '').replace(',', '.'))
    : /^\d+,\d+$/.test(v)
      ? Number(v.replace(',', '.'))
      : /^\d+(\.\d+)?$/.test(v)
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1e12) {
    errors.push(`${field}:invalid`);
    return undefined;
  }
  return n;
}

/**
 * Checks every row before anything is written. A new code needs a name; an
 * existing code updates only the columns that are filled in. Duplicates in
 * the file, bad numbers and going over the plan's product limit are errors.
 */
export function checkImportRows(
  rows: RawImportRow[],
  existingCodes: Set<string>,
  newProductsAllowed: number | null
): { rows: CheckedRow[]; creates: number; updates: number; errorCount: number } {
  const seen = new Set<string>();
  let creates = 0;
  const out: CheckedRow[] = rows.map((raw) => {
    const errors: string[] = [];
    const code = (raw.code ?? '').trim();
    if (!code) errors.push('code:missing');
    else if (code.length > 60) errors.push('code:tooLong');
    if (code && seen.has(code)) errors.push('code:duplicate');
    if (code) seen.add(code);
    const action: CheckedRow['action'] = existingCodes.has(code) ? 'update' : 'create';
    if (action === 'create' && !(raw.name ?? '').trim()) errors.push('name:missing');
    const values: CheckedRow['values'] = {};
    if (raw.name !== undefined) values.name = raw.name.slice(0, 200);
    for (const k of ['category', 'size', 'material', 'shelf', 'supplier', 'notes'] as const) {
      if (raw[k] !== undefined) values[k] = raw[k]!.slice(0, k === 'notes' ? 1000 : 120) || null;
    }
    if (raw.unit !== undefined) values.unit = raw.unit.slice(0, 20) || 'adet';
    const pp = number(raw.purchasePrice, 'purchasePrice', errors);
    if (pp !== undefined) values.purchasePrice = pp;
    const sp = number(raw.salePrice, 'salePrice', errors);
    if (sp !== undefined) values.salePrice = sp;
    const min = number(raw.minStock, 'minStock', errors);
    if (min !== undefined && min !== null) values.minStock = min;
    const target = number(raw.targetStock, 'targetStock', errors);
    if (target !== undefined) values.targetStock = target;
    const stock = number(raw.stock, 'stock', errors);
    if (stock !== undefined && stock !== null) values.stock = stock;
    if (action === 'create' && errors.length === 0) {
      creates += 1;
      if (newProductsAllowed !== null && creates > newProductsAllowed) errors.push('plan:limit');
    }
    return { row: raw.row, code, action, values, errors };
  });
  return {
    rows: out,
    creates: out.filter((r) => r.action === 'create' && r.errors.length === 0).length,
    updates: out.filter((r) => r.action === 'update' && r.errors.length === 0).length,
    errorCount: out.filter((r) => r.errors.length > 0).length,
  };
}

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

/**
 * Karadağ Metal's stock workbook → KolayStok products.
 *
 *   "Ürün Kartları": code (A), name (D), category (E), size/variant (F),
 *                    material (G), list price TL (H) → sale price,
 *                    photo anchored in column C on the product's row.
 *   "Stok Listesi":  code (A), unit (D), shelf (F) — joined on code.
 *
 * Header row 6, data from row 7. Opening stock 100, minimum 50, purchase
 * price empty (as agreed). Pure parsing: no database, no S3.
 */

export interface ImportedProduct {
  row: number;
  code: string;
  name: string;
  category: string | null;
  size: string | null;
  material: string | null;
  salePrice: number | null;
  unit: string;
  shelf: string | null;
  photo: { buffer: Buffer; extension: string } | null;
}

export interface ImportPlan {
  products: ImportedProduct[];
  categories: Array<{ name: string; count: number }>;
  problems: {
    duplicateCodes: string[];
    missingName: number[];
    missingCode: number[];
    badPrice: Array<{ row: number; value: string }>;
    imagesWithoutProduct: number[];
    productsWithoutImage: string[];
    rowsWithSeveralImages: number[];
    noStockListRow: string[];
  };
  totals: { images: number; matchedImages: number };
}

export const OPENING_STOCK = 100;
export const MIN_STOCK = 50;
const FIRST_ROW = 7;

function cellText(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '').trim();
    if ('richText' in v) return v.richText.map((r: any) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
  }
  return String(v).trim();
}

function price(text: string): number | null | 'bad' {
  if (!text) return null;
  const n = Number(text.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'bad';
}

const UNIT_MAP: Record<string, string> = { adet: 'adet', ad: 'adet', kg: 'kg', metre: 'metre', m: 'metre', takım: 'takım', set: 'set', paket: 'paket', koli: 'koli' };
function normalizeUnit(text: string): string {
  const key = text.trim().toLocaleLowerCase('tr-TR');
  return UNIT_MAP[key] ?? (key || 'adet');
}

/**
 * Some generators (the OpenXML SDK) write every spreadsheet tag with an `x:`
 * prefix (<x:workbook>, <x:row>). Excel reads that; exceljs does not. This
 * rewrites the prefix away in memory — the file on disk is never touched.
 */
export async function normalizeSpreadsheetPrefix(input: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  const workbook = await zip.file('xl/workbook.xml')?.async('string');
  if (!workbook || !/<x:workbook[\s>]/.test(workbook)) return input;
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/.*\.xml$/.test(name) || /^xl\/drawings\//.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    if (!xml.includes('<x:')) continue;
    // Excel "table" definitions are not needed to read values and photos,
    // and exceljs cannot resolve them in these files: dropped from the copy.
    const withoutTables = /^xl\/worksheets\//.test(name)
      ? xml.replace(/<x:tableParts[\s\S]*?<\/x:tableParts>|<x:tableParts[^>]*\/>/g, '')
      : xml;
    zip.file(
      name,
      withoutTables.replace(/<(\/?)x:/g, '<$1').replace(/xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g, 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    );
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function planKaradagImport(file: string | Buffer): Promise<ImportPlan> {
  const wb = new ExcelJS.Workbook();
  const raw = typeof file === 'string' ? (await import('fs')).readFileSync(file) : file;
  await wb.xlsx.load((await normalizeSpreadsheetPrefix(raw)) as any);
  const cards = wb.getWorksheet('Ürün Kartları');
  const stock = wb.getWorksheet('Stok Listesi');
  if (!cards || !stock) throw new Error('Expected sheets "Ürün Kartları" and "Stok Listesi"');

  // Stok Listesi: code → unit, shelf
  const stockByCode = new Map<string, { unit: string; shelf: string | null }>();
  for (let r = FIRST_ROW; r <= stock.rowCount; r++) {
    const row = stock.getRow(r);
    const code = cellText(row.getCell(1));
    if (!code) continue;
    stockByCode.set(code, { unit: normalizeUnit(cellText(row.getCell(4))), shelf: cellText(row.getCell(6)) || null });
  }

  // Photos by sheet row (1-based), from their top-left anchor.
  const photosByRow = new Map<number, Array<{ buffer: Buffer; extension: string }>>();
  const images = cards.getImages();
  for (const img of images) {
    const row = Math.floor(img.range.tl.nativeRow ?? (img.range.tl as any).row) + 1;
    const media = wb.getImage(Number(img.imageId)) as any;
    if (!media?.buffer) continue;
    const list = photosByRow.get(row) ?? [];
    list.push({ buffer: Buffer.from(media.buffer), extension: media.extension ?? 'png' });
    photosByRow.set(row, list);
  }

  const products: ImportedProduct[] = [];
  const problems: ImportPlan['problems'] = {
    duplicateCodes: [], missingName: [], missingCode: [], badPrice: [],
    imagesWithoutProduct: [], productsWithoutImage: [], rowsWithSeveralImages: [], noStockListRow: [],
  };
  const seen = new Set<string>();
  const productRows = new Set<number>();

  for (let r = FIRST_ROW; r <= cards.rowCount; r++) {
    const row = cards.getRow(r);
    const code = cellText(row.getCell(1));
    const name = cellText(row.getCell(4));
    if (!code && !name) continue;
    if (!code) { problems.missingCode.push(r); continue; }
    if (!name) { problems.missingName.push(r); continue; }
    if (seen.has(code)) { problems.duplicateCodes.push(code); continue; }
    seen.add(code);
    productRows.add(r);

    const rawPrice = cellText(row.getCell(8));
    const p = price(rawPrice);
    if (p === 'bad') problems.badPrice.push({ row: r, value: rawPrice });
    const fromStock = stockByCode.get(code);
    if (!fromStock) problems.noStockListRow.push(code);
    const photos = photosByRow.get(r) ?? [];
    if (photos.length === 0) problems.productsWithoutImage.push(code);
    if (photos.length > 1) problems.rowsWithSeveralImages.push(r);

    products.push({
      row: r,
      code,
      name: name.replace(/\s+/g, ' '),
      category: cellText(row.getCell(5)) || null,
      size: cellText(row.getCell(6)) || null,
      material: cellText(row.getCell(7)) || null,
      salePrice: p === 'bad' ? null : p,
      unit: fromStock?.unit ?? 'adet',
      shelf: fromStock?.shelf ?? null,
      photo: photos[0] ?? null,
    });
  }

  let matched = 0;
  for (const [row, list] of photosByRow) {
    if (productRows.has(row)) matched += list.length;
    else problems.imagesWithoutProduct.push(row);
  }

  const counts = new Map<string, number>();
  for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const categories = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return { products, categories, problems, totals: { images: images.length, matchedImages: matched } };
}

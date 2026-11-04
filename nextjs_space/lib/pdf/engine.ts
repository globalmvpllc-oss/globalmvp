/**
 * The document PDF engine.
 *
 * Pure JavaScript (pdf-lib + fontkit): no browser, no Chromium, no external
 * service, so it runs in a Vercel serverless function and in unit tests alike.
 *
 * It draws one generic "business document" — a header with the issuer, a
 * party block, dates, then a list of blocks (tables, totals, text). Invoices,
 * account statements and (Phase 2) quotes are each just a spec builder on top
 * of this, so they all look like one product and share one code path.
 *
 * Text is drawn with an embedded Noto Sans subset that covers every Turkish
 * letter (ç ğ ı İ ö ş ü) and the ₺ € £ $ signs. A character outside the font
 * is drawn as "?" rather than an empty box.
 */
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { NOTO_SANS_REGULAR_BASE64 } from './fonts/noto-sans-regular';
import { NOTO_SANS_BOLD_BASE64 } from './fonts/noto-sans-bold';
import { A4_HEIGHT, A4_WIDTH, MARGIN_BOTTOM, MARGIN_TOP, MARGIN_X } from './page';

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

export interface DocColumn {
  label: string;
  /** Share of the content width; the shares are normalised. */
  width: number;
  align?: 'left' | 'right';
}

export interface DocRow {
  cells: string[];
  /** Smaller grey second line under the first cell (e.g. a description). */
  detail?: string;
  style?: 'strong' | 'muted';
}

export type DocBlock =
  | { kind: 'table'; heading?: string; columns: DocColumn[]; rows: DocRow[]; emptyText?: string }
  | { kind: 'totals'; lines: Array<{ label: string; value: string; strong?: boolean }> }
  | { kind: 'text'; title?: string; body: string; boxed?: boolean; small?: boolean };

export interface DocLogo {
  bytes: Uint8Array;
  type: 'png' | 'jpg';
}

export interface BusinessDocumentSpec {
  /** "FATURA", "INVOICE", "TEKLİF", "Hesap ekstresi" … */
  title: string;
  number?: string;
  /** #RRGGBB; anything else falls back to the product colour. */
  brandColor?: string | null;
  logo?: DocLogo | null;
  issuer: { name: string; lines: string[] };
  party: { heading: string; name: string; lines: string[] };
  meta: Array<{ label: string; value: string }>;
  blocks: DocBlock[];
  footer?: string;
  /** "Page {page} of {total}" with those two placeholders. */
  pageLabel?: string;
  /** PDF document properties. */
  metadata?: { title?: string; author?: string; language?: string };
  /** Fixed creation date, for reproducible output in tests. */
  createdAt?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_BRAND = '#7C3AED';
const INK = rgb(0.1, 0.1, 0.18);
const MUTED = rgb(0.42, 0.42, 0.47);
const FAINT = rgb(0.6, 0.6, 0.64);
const RULE = rgb(0.9, 0.9, 0.92);
const HEAD_BG = rgb(0.965, 0.965, 0.975);
const BOX_BG = rgb(0.975, 0.975, 0.98);

function hexToRgb(value: string | null | undefined): RGB {
  const hex = typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_BRAND;
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Decodes a base64 string to bytes without depending on Buffer. */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Logo from a stored data URL. PNG and JPEG are embedded; WebP is not
 * supported by the PDF format's image filters and is skipped (the document
 * renders without a logo rather than failing).
 */
export function logoFromDataUrl(value: unknown): DocLogo | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  try {
    return { bytes: base64ToBytes(match[2]), type: match[1] === 'png' ? 'png' : 'jpg' };
  } catch {
    return null;
  }
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  supported: Set<number>;
}

/** Replaces characters the embedded font cannot draw. */
function clean(text: unknown, fonts: Fonts): string {
  const raw = String(text ?? '').replace(/\t/g, ' ').replace(/\r/g, '');
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || fonts.supported.has(code)) out += ch;
    else if (code === 0x00a0) out += ' ';
    else out += '?';
  }
  return out;
}

/** Word-wraps text to a width; very long words are broken by character. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/ +/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      // Hard-break a word wider than the column.
      let piece = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(piece + ch, size) > maxWidth && piece) {
          lines.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      current = piece;
    }
    lines.push(current);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

class Writer {
  page!: PDFPage;
  y = 0;
  readonly left = MARGIN_X;
  readonly right = A4_WIDTH - MARGIN_X;
  readonly width = A4_WIDTH - 2 * MARGIN_X;
  readonly bottom = MARGIN_BOTTOM + 18; // room for the footer line

  constructor(readonly doc: PDFDocument, readonly fonts: Fonts, readonly brand: RGB) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN_TOP;
  }

  /** Starts a new page when fewer than `needed` points are left. */
  ensure(needed: number): boolean {
    if (this.y - needed < this.bottom) {
      this.newPage();
      return true;
    }
    return false;
  }

  text(
    value: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right'; width?: number } = {}
  ) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const str = clean(value, this.fonts);
    let drawX = x;
    if (opts.align === 'right') {
      const w = font.widthOfTextAtSize(str, size);
      drawX = x + (opts.width ?? 0) - w;
    }
    this.page.drawText(str, { x: drawX, y, size, font, color: opts.color ?? INK });
  }

  wrap(value: string, size: number, maxWidth: number, bold = false): string[] {
    return wrapText(clean(value, this.fonts), bold ? this.fonts.bold : this.fonts.regular, size, maxWidth);
  }

  rule(y: number, color: RGB = RULE, thickness = 0.75, from = this.left, to = this.right) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });
  }
}

function drawHeader(w: Writer, spec: BusinessDocumentSpec, logo: PDFImage | null) {
  const top = w.y;
  let leftY = top;

  if (logo) {
    const scale = Math.min(150 / logo.width, 46 / logo.height, 1);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    w.page.drawImage(logo, { x: w.left, y: leftY - lh, width: lw, height: lh });
    leftY -= lh + 10;
  }

  // Issuer (left column, 55% of the width).
  const leftWidth = w.width * 0.55;
  for (const line of w.wrap(spec.issuer.name, 15, leftWidth, true)) {
    leftY -= 16;
    w.text(line, w.left, leftY, { size: 15, bold: true, color: w.brand });
  }
  for (const raw of spec.issuer.lines) {
    for (const line of w.wrap(raw, 8.5, leftWidth)) {
      leftY -= 11.5;
      w.text(line, w.left, leftY, { size: 8.5, color: MUTED });
    }
  }

  // Title, number and dates (right column).
  const rightWidth = w.width * 0.4;
  const rx = w.right - rightWidth;
  let rightY = top - 22;
  w.text(spec.title, rx, rightY, { size: 22, bold: true, align: 'right', width: rightWidth });
  if (spec.number) {
    rightY -= 16;
    w.text(spec.number, rx, rightY, { size: 11, color: MUTED, align: 'right', width: rightWidth });
  }
  rightY -= 6;
  for (const item of spec.meta) {
    rightY -= 13;
    w.text(`${item.label}: ${item.value}`, rx, rightY, { size: 9, color: MUTED, align: 'right', width: rightWidth });
  }

  w.y = Math.min(leftY, rightY) - 14;
  w.page.drawRectangle({ x: w.left, y: w.y, width: w.width, height: 2.2, color: w.brand });
  w.y -= 20;

  // Party block.
  w.text(spec.party.heading, w.left, w.y, { size: 8, color: FAINT });
  w.y -= 14;
  for (const line of w.wrap(spec.party.name, 11, w.width * 0.7, true)) {
    w.text(line, w.left, w.y, { size: 11, bold: true });
    w.y -= 14;
  }
  for (const raw of spec.party.lines) {
    for (const line of w.wrap(raw, 9, w.width * 0.7)) {
      w.text(line, w.left, w.y, { size: 9, color: MUTED });
      w.y -= 12;
    }
  }
  w.y -= 12;
}

function drawTable(w: Writer, block: Extract<DocBlock, { kind: 'table' }>) {
  const total = block.columns.reduce((s, c) => s + c.width, 0) || 1;
  const widths = block.columns.map((c) => (c.width / total) * w.width);
  const xs: number[] = [];
  widths.reduce((x, width) => {
    xs.push(x);
    return x + width;
  }, w.left);
  const pad = 5;
  const size = 9;
  const line = 12;

  if (block.heading) {
    w.ensure(40);
    w.text(block.heading, w.left, w.y, { size: 10, bold: true, color: MUTED });
    w.y -= 14;
  }

  const drawHead = () => {
    const h = 20;
    w.page.drawRectangle({ x: w.left, y: w.y - h + 6, width: w.width, height: h, color: HEAD_BG });
    block.columns.forEach((col, i) => {
      w.text(col.label, xs[i] + pad, w.y - 8, {
        size: 8.5,
        bold: true,
        color: MUTED,
        align: col.align,
        width: widths[i] - 2 * pad,
      });
    });
    w.y -= h + 2;
  };

  w.ensure(60);
  drawHead();

  const rows = block.rows.length > 0 ? block.rows : null;
  if (!rows) {
    w.text(block.emptyText ?? '—', w.left + pad, w.y - 9, { size, color: MUTED });
    w.y -= 22;
    return;
  }

  for (const row of rows) {
    const bold = row.style === 'strong';
    const color = row.style === 'muted' ? MUTED : INK;
    const cellLines = row.cells.map((cell, i) => w.wrap(cell, size, widths[i] - 2 * pad, bold));
    const detailLines = row.detail ? w.wrap(row.detail, 8, widths[0] - 2 * pad) : [];
    const height = Math.max(...cellLines.map((l) => l.length)) * line + detailLines.length * 10.5 + 8;

    if (w.ensure(height + 4)) drawHead();

    cellLines.forEach((lines, i) => {
      lines.forEach((text, j) => {
        w.text(text, xs[i] + pad, w.y - 9 - j * line, {
          size,
          bold,
          color,
          align: block.columns[i].align,
          width: widths[i] - 2 * pad,
        });
      });
    });
    const firstHeight = cellLines[0].length * line;
    detailLines.forEach((text, j) => {
      w.text(text, xs[0] + pad, w.y - 9 - firstHeight - j * 10.5, { size: 8, color: FAINT });
    });
    w.y -= height;
    w.rule(w.y + 2);
  }
  w.y -= 10;
}

function drawTotals(w: Writer, block: Extract<DocBlock, { kind: 'totals' }>) {
  const boxWidth = 230;
  const x = w.right - boxWidth;
  w.ensure(block.lines.length * 18 + 16);
  for (const item of block.lines) {
    if (item.strong) {
      w.y -= 4;
      w.rule(w.y + 12, INK, 1.2, x, w.right);
    }
    const size = item.strong ? 12 : 9.5;
    w.text(item.label, x, w.y, { size, bold: item.strong, color: item.strong ? INK : MUTED });
    w.text(item.value, x, w.y, { size, bold: item.strong, align: 'right', width: boxWidth });
    w.y -= item.strong ? 20 : 15;
  }
  w.y -= 8;
}

function drawText(w: Writer, block: Extract<DocBlock, { kind: 'text' }>) {
  const size = block.small ? 8.5 : 9.5;
  const line = block.small ? 11.5 : 13;
  const pad = block.boxed ? 9 : 0;
  const inner = w.width - 2 * pad;
  const lines = w.wrap(block.body, size, inner);
  const titleHeight = block.title ? 14 : 0;

  // Long notes may span pages; boxes are drawn per page slice.
  let index = 0;
  let firstSlice = true;
  while (index < lines.length) {
    w.ensure(Math.min(lines.length - index, 3) * line + titleHeight + 2 * pad + 6);
    const available = Math.floor((w.y - w.bottom - 2 * pad - (firstSlice ? titleHeight : 0)) / line);
    const count = Math.max(1, Math.min(lines.length - index, available));
    const height = count * line + (firstSlice ? titleHeight : 0) + 2 * pad;
    if (block.boxed) {
      w.page.drawRectangle({ x: w.left, y: w.y - height + 9, width: w.width, height, color: BOX_BG });
    }
    let y = w.y - pad;
    if (firstSlice && block.title) {
      w.text(block.title, w.left + pad, y, { size: 9, bold: true });
      y -= titleHeight;
    }
    for (let i = 0; i < count; i++) {
      w.text(lines[index + i], w.left + pad, y, { size, color: MUTED });
      y -= line;
    }
    w.y -= height + 8;
    index += count;
    firstSlice = false;
  }
}

let cachedFonts: { regular: Uint8Array; bold: Uint8Array } | null = null;
function fontBytes() {
  if (!cachedFonts) {
    cachedFonts = {
      regular: base64ToBytes(NOTO_SANS_REGULAR_BASE64),
      bold: base64ToBytes(NOTO_SANS_BOLD_BASE64),
    };
  }
  return cachedFonts;
}

/** Renders a document spec to PDF bytes. */
export async function renderBusinessDocumentPdf(spec: BusinessDocumentSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = fontBytes();
  const regular = await doc.embedFont(bytes.regular, { subset: true });
  const bold = await doc.embedFont(bytes.bold, { subset: true });
  const fonts: Fonts = { regular, bold, supported: new Set(regular.getCharacterSet()) };

  const created = spec.createdAt ?? new Date();
  doc.setTitle(clean(spec.metadata?.title ?? `${spec.title} ${spec.number ?? ''}`.trim(), fonts));
  if (spec.metadata?.author) doc.setAuthor(clean(spec.metadata.author, fonts));
  if (spec.metadata?.language) doc.setLanguage(spec.metadata.language);
  doc.setProducer('CorpControl');
  doc.setCreator('CorpControl');
  doc.setCreationDate(created);
  doc.setModificationDate(created);

  let logo: PDFImage | null = null;
  if (spec.logo) {
    try {
      logo = spec.logo.type === 'png' ? await doc.embedPng(spec.logo.bytes) : await doc.embedJpg(spec.logo.bytes);
    } catch {
      logo = null; // an unreadable logo never stops the document
    }
  }

  const writer = new Writer(doc, fonts, hexToRgb(spec.brandColor));
  drawHeader(writer, spec, logo);
  for (const block of spec.blocks) {
    if (block.kind === 'table') drawTable(writer, block);
    else if (block.kind === 'totals') drawTotals(writer, block);
    else drawText(writer, block);
  }

  // Footer and page numbers, once the page count is known.
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const y = MARGIN_BOTTOM - 4;
    page.drawLine({
      start: { x: MARGIN_X, y: y + 12 },
      end: { x: A4_WIDTH - MARGIN_X, y: y + 12 },
      thickness: 0.5,
      color: RULE,
    });
    if (spec.footer) {
      const text = clean(spec.footer, fonts).split('\n')[0];
      const fw = regular.widthOfTextAtSize(text, 8);
      page.drawText(text, { x: (A4_WIDTH - fw) / 2, y, size: 8, font: regular, color: FAINT });
    }
    if (pages.length > 1) {
      const label = (spec.pageLabel ?? '{page} / {total}')
        .split('{page}').join(String(i + 1))
        .split('{total}').join(String(pages.length));
      const text = clean(label, fonts);
      const lw = regular.widthOfTextAtSize(text, 8);
      page.drawText(text, { x: A4_WIDTH - MARGIN_X - lw, y, size: 8, font: regular, color: FAINT });
    }
  });

  return doc.save();
}

/**
 * Page settings shared by every generated document: A4, 20 mm top/bottom and
 * 15 mm left/right — the same margins the documents always had.
 */
export const PDF_OPTIONS = {
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
} as const;

/** A4 in PDF points (1 pt = 1/72 inch). */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

const MM = 72 / 25.4;
export const MARGIN_TOP = 20 * MM;
export const MARGIN_BOTTOM = 20 * MM;
export const MARGIN_X = 15 * MM;

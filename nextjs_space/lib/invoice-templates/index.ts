/**
 * Invoice template registry.
 *
 * The Settings screen has offered classic / modern / minimal for a while, but
 * the renderer ignored the value and always drew one layout. Selection now goes
 * through this map, keyed by the same `invoiceTemplate` string that
 * companySchema already validates — so no schema change is needed, and adding a
 * fourth layout later means one file and one entry here.
 */

import { buildInvoiceView } from './view-model';
import { renderClassic } from './classic';
import { renderModern } from './modern';
import { renderMinimal } from './minimal';
import type { InvoiceView } from './view-model';

export type InvoiceTemplateId = 'classic' | 'modern' | 'minimal';

/** Used when a company has never chosen, and when the stored value is unusable. */
export const DEFAULT_TEMPLATE: InvoiceTemplateId = 'classic';

const TEMPLATES: Record<InvoiceTemplateId, (view: InvoiceView) => string> = {
  classic: renderClassic,
  modern: renderModern,
  minimal: renderMinimal,
};

/**
 * Maps a stored value to a template id.
 *
 * Anything unrecognised — a removed template, a typo, a value from a future
 * version, or nothing at all — resolves to classic. An invoice must always
 * render; refusing to draw one because of a settings string would be worse
 * than drawing it in the default layout.
 */
export function resolveTemplateId(value: unknown): InvoiceTemplateId {
  if (typeof value !== 'string') return DEFAULT_TEMPLATE;
  const key = value.trim().toLowerCase();
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so 'constructor'
  // and '__proto__' would resolve to a template id whose lookup then yields
  // something that is not a render function.
  return Object.prototype.hasOwnProperty.call(TEMPLATES, key)
    ? (key as InvoiceTemplateId)
    : DEFAULT_TEMPLATE;
}

/** Every id the UI may offer. */
export const INVOICE_TEMPLATE_IDS = Object.keys(TEMPLATES) as InvoiceTemplateId[];

/**
 * Renders an invoice in the company's chosen template.
 *
 * The view model is built once and shared, so the same invoice produces the
 * same figures, the same escaping and the same settings behaviour in all three
 * layouts — only the markup around them differs.
 */
export function renderInvoiceHtml(
  invoice: any,
  company?: any,
  logoDataUrl?: string | null
): string {
  const view = buildInvoiceView(invoice, company, logoDataUrl);
  const render = TEMPLATES[resolveTemplateId(company?.invoiceTemplate)];
  return render(view);
}

export { buildInvoiceView } from './view-model';
export type { InvoiceView } from './view-model';
export { safeBrandColor, safeLogoSrc, esc, DEFAULT_BRAND_COLOR } from './view-model';

/**
 * Invoice document entry point.
 *
 * The markup now lives in lib/invoice-templates/, one file per layout, with a
 * shared pre-escaped view model. This module keeps the original function name
 * and signature so the invoice page and the PDF flow are unchanged.
 */

export { renderInvoiceHtml as generateInvoiceHtml } from '@/lib/invoice-templates';
export {
  resolveTemplateId,
  INVOICE_TEMPLATE_IDS,
  DEFAULT_TEMPLATE,
  type InvoiceTemplateId,
} from '@/lib/invoice-templates';

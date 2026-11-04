import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Server helpers shared by the PDF routes.
 */

/** A PDF download response. Never cached: documents are private. */
export function pdfResponse(bytes: Uint8Array, fileName: string): Response {
  const safe = fileName.replace(/[^\w.-]+/g, '_') || 'document.pdf';
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safe}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Everything a document header needs about the issuing company. */
export const COMPANY_DOCUMENT_SELECT = {
  id: true,
  name: true,
  legalName: true,
  country: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  email: true,
  website: true,
  taxNumber: true,
  taxOffice: true,
  logoUrl: true,
  primaryColor: true,
  invoiceFooter: true,
  invoiceShowLogo: true,
  invoiceShowTax: true,
  paymentInstructions: true,
  bankTransferInstructions: true,
} as const;

export function loadDocumentCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId }, select: COMPANY_DOCUMENT_SELECT });
}

import 'server-only';
import Decimal from 'decimal.js';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { TxClient } from '@/lib/invoice-number';
import { allocateQuoteNumber } from '@/lib/quote-number';
import { canTransitionQuote } from '@/lib/quote-status';
import { quoteEmail } from '@/lib/email/templates';
import { documentLocaleFor } from '@/lib/tr-tax';
import { translate } from '@/lib/i18n';
import { renderBusinessDocumentPdf, type DocBlock, type DocLogo } from '@/lib/pdf/engine';
import { buildQuotePdfSpec, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { loadDocumentCompany } from '@/lib/pdf/response';
import { isPublicBlobUrl } from '@/lib/storage';
import { QUOTE_VAT_RATE, quoteDeductions, quoteTotals, quoteValidUntil } from './rules';
import { moveStockTx, type MoveResult } from './service';
import { DEFAULT_STOCK_SENDER } from './orders';
import type { StockActor } from './actor';

/**
 * Sales quotes prepared in Avc KolayStok.
 *
 * Written to the existing Quote / QuoteItem tables (numbering from
 * allocateQuoteNumber, currency TRY, source "kolaystok"), each line linked to
 * its stock product. Prices are entered without VAT; "KDV %20 ekle" adds VAT
 * on top. Sending never changes stock; accepting takes the products out of
 * stock once, as "Satış (−)" with the quote number in the note.
 */

export const quoteInputSchema = z.object({
  customerId: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().finite().positive().max(1e9),
        unitPrice: z.number().finite().min(0).max(1e11),
      })
    )
    .min(1)
    .max(300),
  addVat: z.boolean(),
  validDays: z.number().int().min(1).max(365),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).nullable().optional(),
});

const QUOTE_INCLUDE = {
  customer: true,
  items: { include: { stockProduct: { select: { id: true, code: true, name: true, size: true, unit: true, photoKey: true } } } },
} as const;

/** Who receives it and who it comes from. */
async function addresses(companyId: string) {
  const [settings, owner, company] = await Promise.all([
    prisma.stockSettings.findUnique({ where: { companyId }, select: { senderEmail: true, senderVerifiedAt: true } }),
    prisma.companyMember.findFirst({
      where: { companyId, role: 'owner', user: { isActive: true } },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { email: true } } },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }),
  ]);
  return {
    from: settings?.senderEmail && settings.senderVerifiedAt ? settings.senderEmail : DEFAULT_STOCK_SENDER,
    replyTo: owner?.user.email ?? company?.email ?? null,
  };
}

/**
 * The quote as it would be saved — from the screen's input, checked against
 * this company's customer and products (prices and names come from the
 * input and the product rows, never from another company).
 */
export async function draftQuote(companyId: string, input: QuoteInput, now = new Date()) {
  const [customer, products] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, companyId } }),
    prisma.stockProduct.findMany({
      where: { companyId, isActive: true, id: { in: input.lines.map((l) => l.productId) } },
      select: { id: true, code: true, name: true, size: true, unit: true, photoKey: true, quantity: true },
    }),
  ]);
  if (!customer) return { error: 'CUSTOMER_NOT_FOUND' as const };
  if (!customer.email) return { error: 'NO_EMAIL' as const };
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = input.lines.filter((l) => byId.has(l.productId));
  if (lines.length === 0) return { error: 'NO_LINES' as const };
  const totals = quoteTotals(lines, input.addVat);
  const items = lines.map((l, i) => {
    const p = byId.get(l.productId)!;
    return {
      description: `${p.name}${p.size ? ` ${p.size}` : ''}`.slice(0, 500),
      quantity: new Decimal(l.quantity),
      unitPrice: new Decimal(l.unitPrice),
      discount: new Decimal(0),
      taxRate: new Decimal(input.addVat ? QUOTE_VAT_RATE : 0),
      taxLabel: 'KDV',
      amount: totals.amounts[i],
      stockProductId: p.id,
      stockProduct: { id: p.id, code: p.code, name: p.name, size: p.size, unit: p.unit, photoKey: p.photoKey },
      overStock: new Decimal(l.quantity).gt(p.quantity),
    };
  });
  return {
    error: null,
    customer,
    items,
    addVat: input.addVat,
    note: input.note?.trim() || null,
    issueDate: now,
    validUntil: quoteValidUntil(input.validDays, now),
    subtotal: totals.subtotal,
    taxTotal: totals.tax,
    total: totals.total,
  };
}

type QuoteLike = {
  quoteNumber: string;
  issueDate: Date;
  validUntil: Date;
  currency: string;
  subtotal: Decimal.Value;
  taxTotal: Decimal.Value;
  discountTotal?: Decimal.Value;
  total: Decimal.Value;
  notes: string | null;
  customer: any;
  items: Array<{
    description: string;
    quantity: Decimal.Value;
    unitPrice: Decimal.Value;
    discount: Decimal.Value;
    taxRate: Decimal.Value;
    taxLabel: string;
    amount: Decimal.Value;
    stockProduct?: { code: string; name: string; size: string | null; unit: string; photoKey: string | null } | null;
  }>;
};

/** A small JPEG of a product photo for the PDF (public Blob address only). */
async function photoThumb(address: string | null | undefined): Promise<DocLogo | null> {
  if (!isPublicBlobUrl(address)) return null;
  try {
    const res = await fetch(address, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = await sharp(Buffer.from(await res.arrayBuffer())).resize(120, 120, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
    return { bytes: new Uint8Array(bytes), type: 'jpg' };
  } catch {
    return null;
  }
}

/**
 * The quote PDF: the CorpControl quote layout (logo, company, customer, dates,
 * totals) with a product table — small photo, code, name and size, quantity,
 * unit price, amount. Without VAT it says "Fiyatlara KDV dahil değildir".
 */
/**
 * Logos are saved as WebP by the browser, which the PDF format cannot embed
 * (the logo silently disappeared). The quote PDF gets a PNG copy instead.
 */
export async function pdfReadyLogo(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  const webp = logoUrl.match(/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!webp) return logoUrl;
  try {
    const png = await sharp(Buffer.from(webp[1], 'base64')).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderStockQuotePdf(companyId: string, quote: QuoteLike, addVat: boolean): Promise<Uint8Array> {
  const loaded = await loadDocumentCompany(companyId);
  const company = loaded ? { ...loaded, logoUrl: await pdfReadyLogo(loaded.logoUrl) } : loaded;
  const locale = documentLocaleFor(quote.customer, company);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const money = (v: Decimal.Value) =>
    new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: quote.currency || 'TRY' }).format(new Decimal(v).toNumber());
  const qty = (v: Decimal.Value) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(new Decimal(v).toNumber());

  const spec = buildQuotePdfSpec({ ...quote, discountTotal: quote.discountTotal ?? 0 }, { ...company, invoiceShowTax: true });
  const thumbs = await Promise.all(quote.items.map((i) => photoThumb(i.stockProduct?.photoKey)));
  const table: DocBlock = {
    kind: 'table',
    columns: [
      { label: '', width: 9 },
      { label: t('ks.quote.pdf.code'), width: 13 },
      { label: t('ks.quote.pdf.product'), width: 36 },
      { label: t('pdf.qty'), width: 12, align: 'right' },
      { label: t('pdf.price'), width: 14, align: 'right' },
      { label: t('pdf.amount'), width: 16, align: 'right' },
    ],
    rows: quote.items.map((item, i) => ({
      image: thumbs[i],
      cells: [
        '',
        item.stockProduct?.code ?? '',
        item.description,
        `${qty(item.quantity)} ${item.stockProduct?.unit ?? ''}`.trim(),
        money(item.unitPrice),
        money(item.amount),
      ],
    })),
  };
  const firstTable = spec.blocks.findIndex((b) => b.kind === 'table');
  const blocks = [...spec.blocks];
  if (firstTable >= 0) blocks[firstTable] = table;
  else blocks.unshift(table);
  if (!addVat) {
    const totalsAt = blocks.findIndex((b) => b.kind === 'totals');
    blocks.splice(totalsAt >= 0 ? totalsAt + 1 : blocks.length, 0, { kind: 'text', body: t('ks.quote.vatExcluded'), boxed: true, small: true });
  }
  return renderBusinessDocumentPdf({ ...spec, blocks });
}

/** The email that goes with the PDF (number, total, valid until). */
export async function quoteMail(companyId: string, quote: QuoteLike) {
  const [company, addr] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, country: true } }),
    addresses(companyId),
  ]);
  const locale = documentLocaleFor(quote.customer, company);
  const email = quoteEmail({
    locale,
    companyName: company?.name ?? '',
    customerName: quote.customer.name,
    quoteNumber: quote.quoteNumber,
    total: quote.total,
    currency: quote.currency,
    validUntil: quote.validUntil,
  });
  return { to: String(quote.customer.email ?? ''), from: addr.from, replyTo: addr.replyTo, companyName: company?.name ?? '', email, fileName: invoicePdfFileName(quote.quoteNumber) };
}

/** Saves the quote (DRAFT) with the next quote number; the send marks it SENT. */
export async function saveQuote(companyId: string, draft: Extract<Awaited<ReturnType<typeof draftQuote>>, { error: null }>) {
  return prisma.$transaction(async (tx: TxClient) => {
    const quoteNumber = await allocateQuoteNumber(tx, companyId);
    const quote = await tx.quote.create({
      data: {
        companyId,
        customerId: draft.customer.id,
        quoteNumber,
        status: 'DRAFT',
        issueDate: draft.issueDate,
        validUntil: draft.validUntil,
        currency: 'TRY',
        subtotal: draft.subtotal.toString(),
        taxTotal: draft.taxTotal.toString(),
        total: draft.total.toString(),
        notes: draft.note,
        source: 'kolaystok',
        items: {
          create: draft.items.map((i) => ({
            description: i.description,
            quantity: i.quantity.toString(),
            unitPrice: i.unitPrice.toString(),
            discount: '0',
            taxRate: i.taxRate.toString(),
            taxLabel: i.taxLabel,
            amount: i.amount.toString(),
            stockProductId: i.stockProductId,
          })),
        },
      },
      include: QUOTE_INCLUDE,
    });
    await tx.stockSettings.updateMany({ where: { companyId }, data: { quoteAddVat: draft.addVat } });
    return quote;
  });
}

export function loadStockQuote(companyId: string, id: string) {
  return prisma.quote.findFirst({ where: { id, companyId, source: 'kolaystok' }, include: QUOTE_INCLUDE });
}

/** Whether a saved quote carries VAT (its lines were saved with 20 %). */
export function quoteHasVat(quote: { taxTotal: Decimal.Value }): boolean {
  return new Decimal(quote.taxTotal).gt(0);
}

export class QuoteStockConfirmationNeeded extends Error {
  constructor(readonly negative: Array<{ productId: string; code: string; name: string; after: number }>) {
    super('CONFIRM');
    this.name = 'QuoteStockConfirmationNeeded';
  }
}

/**
 * Marks a KolayStok quote accepted or rejected. Accepting takes every line's
 * product out of stock as "Satış (−)" (note: "Teklif TKL-…"), in one
 * transaction, claimed with stockDeductedAt so it can only ever happen once.
 * Stock going below zero needs `confirmed`. Throws NOT_FOUND, BAD_TRANSITION,
 * QuoteStockConfirmationNeeded.
 */
export async function setStockQuoteStatus(
  actor: StockActor,
  quoteId: string,
  status: 'ACCEPTED' | 'REJECTED',
  confirmed: boolean
): Promise<{ status: string; moved: MoveResult[] }> {
  return prisma.$transaction(
    async (tx: TxClient) => {
      const quote = await tx.quote.findFirst({
        where: { id: quoteId, companyId: actor.companyId, source: 'kolaystok' },
        select: { id: true, status: true, quoteNumber: true, stockDeductedAt: true, items: { select: { stockProductId: true, quantity: true } } },
      });
      if (!quote) throw new Error('NOT_FOUND');
      if (!canTransitionQuote(quote.status, status)) throw new Error('BAD_TRANSITION');

      const moved: MoveResult[] = [];
      if (status === 'ACCEPTED') {
        const claimed = await tx.quote.updateMany({ where: { id: quote.id, companyId: actor.companyId, stockDeductedAt: null }, data: { stockDeductedAt: new Date() } });
        if (claimed.count === 1) {
          const ids = [...new Set(quote.items.map((i) => i.stockProductId).filter((v): v is string => Boolean(v)))];
          const rows = ids.length
            ? await tx.$queryRaw<Array<{ id: string; code: string; name: string; quantity: string }>>`
                SELECT id, code, name, quantity::text AS quantity FROM "StockProduct"
                WHERE "companyId" = ${actor.companyId} AND "isActive" = true AND id = ANY(${ids})
                FOR UPDATE`
            : [];
          const plan = quoteDeductions(quote.items, new Map(rows.map((r) => [r.id, r.quantity])));
          if (plan.negative.length && !confirmed) {
            const byId = new Map(rows.map((r) => [r.id, r]));
            throw new QuoteStockConfirmationNeeded(
              plan.negative.map((n) => ({ productId: n.productId, code: byId.get(n.productId)!.code, name: byId.get(n.productId)!.name, after: n.after.toNumber() }))
            );
          }
          for (const m of plan.moves) {
            moved.push(
              await moveStockTx(tx, { companyId: actor.companyId, productId: m.productId, delta: m.quantity.negated(), reason: 'sale', note: `Teklif ${quote.quoteNumber}`, actor })
            );
          }
        }
      }
      await tx.quote.update({ where: { id: quote.id }, data: { status } });
      return { status, moved };
    },
    { timeout: 60_000 }
  );
}

import { z } from 'zod';

/** A product as a manager types it. Numbers arrive as numbers or strings. */
const money = z
  .union([z.number(), z.string()])
  .transform((v) => (v === '' ? null : Number(String(v).replace(',', '.'))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e12), 'Invalid amount')
  .nullable()
  .optional();

const qty = z
  .union([z.number(), z.string()])
  .transform((v) => (v === '' ? null : Number(String(v).replace(',', '.'))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e9), 'Invalid quantity')
  .nullable()
  .optional();

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const productInputSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().nullable().optional(),
  size: text(120),
  material: text(120),
  unit: z.string().trim().min(1).max(20).optional(),
  purchasePrice: money,
  salePrice: money,
  minStock: qty,
  targetStock: qty,
  shelf: text(60),
  vendorId: z.string().nullable().optional(),
  notes: text(1000),
  /** Only when creating: the opening stock, written as an "Açılış" movement. */
  openingStock: qty,
});

export type ProductInput = z.infer<typeof productInputSchema>;

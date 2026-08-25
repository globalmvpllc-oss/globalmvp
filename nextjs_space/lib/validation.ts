import { z } from 'zod';

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY'] as const;
const VALID_PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'other'] as const;

/**
 * Date strings arriving from clients used to be passed straight into `new Date()`,
 * which silently produces `Invalid Date` and then blows up inside Prisma as a 500.
 * This validates parseability up front so the caller gets a 400 instead.
 */
const dateString = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date' });

/** Category names are free-form strings (no FK), but must not be blank padding. */
const categoryName = z
  .string()
  .max(100)
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, { message: 'Category cannot be empty' });

export const signupSchema = z.object({
  email: z
    .string()
    .max(255)
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().max(255).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .max(255)
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address')),
  password: z.string().min(1, 'Password is required'),
});

export const companySchema = z.object({
  name: z.string().min(1, 'Business name is required').max(255),
  country: z.string().min(2).max(3).optional(),
  defaultCurrency: z.enum(VALID_CURRENCIES).optional(),
  timezone: z.string().max(100).optional(),
  locale: z.string().max(20).optional(),
  businessType: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  website: z.string().max(255).optional(),
  taxNumber: z.string().max(100).optional(),
  taxOffice: z.string().max(100).optional(),
  legalName: z.string().max(255).optional(),
});

export const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(255),
  companyName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(3).optional(),
  taxId: z.string().max(100).optional(),
  defaultCurrency: z.enum(VALID_CURRENCIES).optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required').max(500),
  quantity: z.number().positive('Quantity must be > 0'),
  unitPrice: z.number().min(0, 'Unit price must be >= 0'),
  discount: z.number().min(0, 'Discount must be >= 0').default(0),
  taxRate: z.number().min(0, 'Tax rate must be >= 0').max(100, 'Tax rate must be <= 100').default(0),
  taxLabel: z.string().max(50).default('VAT'),
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  invoiceNumber: z.string().max(50).optional(),
  status: z.enum(['DRAFT', 'SENT']).optional(),
  issueDate: dateString.optional(),
  dueDate: dateString,
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  notes: z.string().max(5000).optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

/**
 * NOTE: `amountPaid` is deliberately NOT accepted here.
 * It is derived exclusively from Payment records via lib/payment-calc.ts.
 * Accepting it from a client would let a caller mark an invoice paid for free.
 */
export const invoiceUpdateSchema = z.object({
  customerId: z.string().optional(),
  invoiceNumber: z.string().max(50).optional(),
  status: z.string().max(30).optional(),
  issueDate: dateString.optional(),
  dueDate: dateString.optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(invoiceItemSchema).optional(),
});

export const paymentSchema = z
  .object({
    invoiceId: z.string().min(1).max(64).optional(),
    expenseId: z.string().min(1).max(64).optional(),
    amount: z.number().positive('Payment amount must be > 0').finite(),
    currency: z.enum(VALID_CURRENCIES).default('USD'),
    paymentDate: dateString.optional(),
    paymentMethod: z.enum(VALID_PAYMENT_METHODS).default('bank_transfer'),
    reference: z.string().max(255).optional(),
    notes: z.string().max(2000).optional(),
  })
  // A payment with neither target is unreachable data: it never shows in any
  // report and cannot be corrected. A payment with both is ambiguous.
  .refine((d) => Boolean(d.invoiceId) !== Boolean(d.expenseId), {
    message: 'Payment must be linked to exactly one of invoiceId or expenseId',
    path: ['invoiceId'],
  });

export const incomeSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  category: categoryName.optional(),
  amount: z.number().positive('Amount must be > 0').finite(),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  date: dateString.optional(),
  expectedPaymentDate: dateString.optional(),
  status: z.enum(['EXPECTED', 'RECEIVED']).optional(),
  customerId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const incomeUpdateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  category: categoryName.optional(),
  amount: z.number().positive().finite().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  date: dateString.optional(),
  expectedPaymentDate: dateString.optional().nullable(),
  status: z.enum(['EXPECTED', 'RECEIVED']).optional(),
  customerId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  category: categoryName.optional(),
  amount: z.number().positive('Amount must be > 0').finite(),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  date: dateString.optional(),
  dueDate: dateString.optional(),
  status: z.enum(['UNPAID', 'PAID']).optional(),
  vendorId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const expenseUpdateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  category: categoryName.optional(),
  amount: z.number().positive().finite().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  date: dateString.optional(),
  dueDate: dateString.optional().nullable(),
  status: z.enum(['UNPAID', 'PAID']).optional(),
  vendorId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  type: z.enum(['income', 'expense']).default('expense'),
  color: z.string().max(20).optional(),
});

export const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(255),
  companyName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  country: z.string().max(3).optional(),
  taxId: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

/** Calendar event types. Strings rather than an enum, matching how invoice and
 *  transaction statuses are already modelled in this schema. */
export const EVENT_TYPES = [
  'MEETING',
  'REMINDER',
  'PAYMENT',
  'INVOICE',
  'EXPENSE',
  'OTHER',
] as const;

/** Lifecycle marker for an event. */
export const EVENT_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'] as const;

const eventBase = {
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional().or(z.literal('')),
  startAt: dateString,
  endAt: dateString.optional().or(z.literal('')),
  allDay: z.boolean().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  customerId: z.string().min(1).max(64).optional().or(z.literal('')),
  invoiceId: z.string().min(1).max(64).optional().or(z.literal('')),
  amount: z.number().finite().nonnegative().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  reminderAt: dateString.optional().or(z.literal('')),
};

/**
 * An event that ends before it starts is a data-entry mistake, not something to
 * store and render as a negative-width block on the calendar.
 */
const endsAfterItStarts = (data: { startAt?: string; endAt?: string | null }) => {
  if (!data.startAt || !data.endAt) return true;
  return Date.parse(data.endAt) >= Date.parse(data.startAt);
};

const END_BEFORE_START = {
  message: 'End time cannot be before the start time',
  path: ['endAt'],
};

export const eventCreateSchema = z
  .object(eventBase)
  .refine(endsAfterItStarts, END_BEFORE_START);

/**
 * Every field optional for a partial update, but the start/end ordering rule
 * still applies whenever both are supplied.
 *
 * `source` is deliberately absent: it records how a row came into existence and
 * is set by the server, so a client cannot relabel its own entry as
 * system-generated.
 */
export const eventUpdateSchema = z
  .object({
    title: eventBase.title.optional(),
    description: eventBase.description,
    startAt: dateString.optional(),
    endAt: eventBase.endAt,
    allDay: eventBase.allDay,
    type: eventBase.type,
    status: eventBase.status,
    customerId: eventBase.customerId,
    invoiceId: eventBase.invoiceId,
    amount: eventBase.amount,
    currency: eventBase.currency,
    reminderAt: eventBase.reminderAt,
  })
  .refine(endsAfterItStarts, END_BEFORE_START);

/** Date-range filter for listing events, e.g. one month of the calendar. */
export const eventRangeSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

/**
 * Helper: parse body with a Zod schema; return parsed data or error response.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { data: T; error: null } | { data: null; error: { error: string; details?: z.ZodIssue[] } } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      data: null,
      error: {
        error: 'Validation failed',
        details: result.error.issues,
      },
    };
  }
  return { data: result.data, error: null };
}

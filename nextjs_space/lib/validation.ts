import { z } from 'zod';

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY'] as const;
const VALID_PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'other'] as const;

export const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  name: z.string().max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
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
  issueDate: z.string().optional(),
  dueDate: z.string().min(1, 'Due date is required'),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  notes: z.string().max(5000).optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
});

export const invoiceUpdateSchema = z.object({
  customerId: z.string().optional(),
  invoiceNumber: z.string().max(50).optional(),
  status: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(invoiceItemSchema).optional(),
  amountPaid: z.number().optional(),
});

export const paymentSchema = z.object({
  invoiceId: z.string().optional(),
  expenseId: z.string().optional(),
  amount: z.number().positive('Payment amount must be > 0'),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  paymentDate: z.string().optional(),
  paymentMethod: z.enum(VALID_PAYMENT_METHODS).default('bank_transfer'),
  reference: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export const incomeSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  category: z.string().max(100).optional(),
  amount: z.number().positive('Amount must be > 0'),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  date: z.string().optional(),
  expectedPaymentDate: z.string().optional(),
  status: z.enum(['EXPECTED', 'RECEIVED']).optional(),
  customerId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const incomeUpdateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  date: z.string().optional(),
  expectedPaymentDate: z.string().optional().nullable(),
  status: z.enum(['EXPECTED', 'RECEIVED']).optional(),
  customerId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  category: z.string().max(100).optional(),
  amount: z.number().positive('Amount must be > 0'),
  currency: z.enum(VALID_CURRENCIES).default('USD'),
  date: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['UNPAID', 'PAID']).optional(),
  vendorId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const expenseUpdateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  date: z.string().optional(),
  dueDate: z.string().optional().nullable(),
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

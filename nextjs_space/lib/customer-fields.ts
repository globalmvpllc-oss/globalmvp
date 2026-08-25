/**
 * Pure field shaping for customers — no database access.
 *
 * Kept separate from the route (which imports the Prisma client) so the rules
 * can be unit-tested without a generated client or a live connection, mirroring
 * the event-fields / event-helpers split already used in this codebase.
 */

/**
 * Turns an optional client string into what Prisma should store.
 *
 * An empty string means "clear this field" and becomes null; an absent value
 * means "leave it alone" and becomes undefined, which Prisma skips.
 *
 * This distinction only started to matter once customers became editable. The
 * update route previously wrote `data.email || undefined`, so blanking an email
 * was silently ignored and the old address stayed on the record — a customer
 * whose email was entered by mistake could never have it removed.
 */
export function optionalCustomerText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** The validated shape the customer routes hand to Prisma. */
export interface CustomerFieldInput {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  taxId?: string;
  defaultCurrency?: string;
  notes?: string;
}

export interface CustomerUpdateData {
  name: string;
  companyName: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  postalCode: string | null | undefined;
  country: string | null | undefined;
  taxId: string | null | undefined;
  defaultCurrency: string | null | undefined;
  notes: string | null | undefined;
}

/**
 * Builds the Prisma update payload for a customer.
 *
 * `name` is required by the schema and is never nulled — a customer without a
 * name is not a record anyone can use. Every other field is clearable.
 *
 * Note this deliberately does NOT carry companyId: ownership is resolved from
 * the session in the route and must never be taken from a request body.
 */
export function buildCustomerUpdateData(data: CustomerFieldInput): CustomerUpdateData {
  return {
    name: data.name,
    companyName: optionalCustomerText(data.companyName),
    email: optionalCustomerText(data.email),
    phone: optionalCustomerText(data.phone),
    address: optionalCustomerText(data.address),
    city: optionalCustomerText(data.city),
    state: optionalCustomerText(data.state),
    postalCode: optionalCustomerText(data.postalCode),
    country: optionalCustomerText(data.country),
    taxId: optionalCustomerText(data.taxId),
    defaultCurrency: optionalCustomerText(data.defaultCurrency),
    notes: optionalCustomerText(data.notes),
  };
}

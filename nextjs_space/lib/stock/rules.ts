import Decimal from 'decimal.js';

/**
 * Avc KolayStok — the rules, pure and tested.
 *
 * Who may do what, how stock moves, when an alert fires, how the search box
 * matches. No Prisma here; the routes load the rows and ask these functions.
 */

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

/**
 * "manager"  — the company owner (CorpControl account) or a staff member with
 *              the Yönetici role: everything.
 * "staff"    — warehouse staff: move stock, count, read. Never sees prices or
 *              stock value; cannot add/delete products, change settings,
 *              email suppliers or reset.
 * "viewer"   — the company's accountant (mali müşavir): reads everything,
 *              prices included, changes nothing.
 */
export type StockRole = 'manager' | 'staff' | 'viewer';

export type StockPermission =
  | 'read' // products, movements, summary (without prices)
  | 'read.prices' // purchase/sale prices and stock value
  | 'move' // + / − and quantity changes, undo own
  | 'count' // stock counts
  | 'products.write' // add, edit, delete products and categories, Excel import
  | 'suppliers.write'
  | 'settings' // staff & PINs, alert recipients, Telegram, sender, usage mode
  | 'order.email' // prepare and send purchase-order emails
  | 'export' // Excel of the stock, backups
  | 'reset'; // reset all stock (also needs the account password)

const GRANTS: Record<StockRole, ReadonlySet<StockPermission>> = {
  manager: new Set<StockPermission>([
    'read', 'read.prices', 'move', 'count', 'products.write', 'suppliers.write', 'settings', 'order.email', 'export', 'reset',
  ]),
  staff: new Set<StockPermission>(['read', 'move', 'count']),
  viewer: new Set<StockPermission>(['read', 'read.prices', 'export']),
};

export function can(role: StockRole, permission: StockPermission): boolean {
  return GRANTS[role]?.has(permission) ?? false;
}

/** A CompanyMember role in CorpControl → the KolayStok role. */
export function stockRoleForMember(memberRole: string): StockRole {
  if (memberRole === 'accountant') return 'viewer';
  if (memberRole === 'owner' || memberRole === 'admin') return 'manager';
  return 'staff';
}

export const STAFF_ROLES = ['manager', 'staff'] as const;
export const MAX_STAFF_PER_COMPANY = 5;

// ---------------------------------------------------------------------------
// PIN sign-in
// ---------------------------------------------------------------------------

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;
export const STAFF_SESSION_DAYS = 30;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export function isLocked(staff: { lockedUntil?: Date | string | null }, now: Date = new Date()): boolean {
  return Boolean(staff.lockedUntil && new Date(staff.lockedUntil).getTime() > now.getTime());
}

/** After a wrong PIN: the fifth failure in a row locks for 15 minutes. */
export function afterWrongPin(
  staff: { failedPins: number },
  now: Date = new Date()
): { failedPins: number; lockedUntil: Date | null } {
  const failedPins = staff.failedPins + 1;
  if (failedPins >= PIN_MAX_FAILURES) {
    return { failedPins: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) };
  }
  return { failedPins, lockedUntil: null };
}

// ---------------------------------------------------------------------------
// Stock levels and movements
// ---------------------------------------------------------------------------

export const MOVEMENT_REASONS = [
  'sale', // Satış
  'production', // Üretim
  'waste', // Fire
  'return', // İade
  'receipt', // Mal kabul
  'count', // Sayım düzeltmesi
  'other', // Diğer
  'opening', // Açılış
  'reset', // Sıfırlama
  'reset-undo', // Sıfırlamanın geri alınması
  'undo', // Geri al
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Reasons a person picks by hand (the rest are written by the system). */
export const MANUAL_REASONS: readonly MovementReason[] = ['sale', 'production', 'waste', 'return', 'receipt', 'count', 'other'];

export function isManualReason(value: unknown): value is MovementReason {
  return typeof value === 'string' && (MANUAL_REASONS as readonly string[]).includes(value);
}

export type StockLevel = 'ok' | 'low' | 'out';

/** Green above the minimum, yellow at or below it, red at zero or less. */
export function stockLevel(quantity: Decimal.Value, minStock: Decimal.Value): StockLevel {
  const q = new Decimal(quantity);
  if (q.lte(0)) return 'out';
  if (q.lte(new Decimal(minStock))) return 'low';
  return 'ok';
}

/** Undo is offered for 10 seconds on screen; the server allows a little more. */
export const UNDO_WINDOW_MS = 2 * 60_000;

export interface MovementPlan {
  quantityAfter: Decimal;
  /** Set the low-stock alert now (it fires once per dip). */
  fireAlert: boolean;
  /** Clear the alert stamp: back above the minimum. */
  clearAlert: boolean;
}

/**
 * The effect of changing a product's stock by `delta`.
 *
 * An alert fires when the product ends at or below its minimum and no alert is
 * outstanding for it; the stamp clears once it is above the minimum again, so
 * the next dip alerts again — never twice for the same dip.
 */
export function planMovement(
  product: { quantity: Decimal.Value; minStock: Decimal.Value; lowAlertAt?: Date | string | null },
  delta: Decimal.Value
): MovementPlan {
  const quantityAfter = new Decimal(product.quantity).plus(new Decimal(delta));
  const atOrBelow = quantityAfter.lte(new Decimal(product.minStock));
  return {
    quantityAfter,
    fireAlert: atOrBelow && !product.lowAlertAt,
    clearAlert: !atOrBelow && Boolean(product.lowAlertAt),
  };
}

/** Purchase-order quantity: target − current, or minimum × 2 − current. Never below 0. */
export function orderQuantity(product: { quantity: Decimal.Value; minStock: Decimal.Value; targetStock?: Decimal.Value | null }): Decimal {
  const target = product.targetStock !== null && product.targetStock !== undefined
    ? new Decimal(product.targetStock)
    : new Decimal(product.minStock).mul(2);
  return Decimal.max(target.minus(new Decimal(product.quantity)), 0);
}

// ---------------------------------------------------------------------------
// Search — Turkish-insensitive, on name and code
// ---------------------------------------------------------------------------

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** "Çember Ø40" → "cember40"; "İŞ" → "is". Letters and digits only. */
export function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** "PZ001" → "pz1", "AB-0120" → "ab120": a code as people type it. */
export function compactCode(code: unknown): string {
  return normalizeSearch(code).replace(/(\D)0+(?=\d)/g, '$1');
}

/** What the search box matches against, stored on the product. */
export function buildSearchKey(product: { code: string; name: string; size?: string | null; material?: string | null }): string {
  return [normalizeSearch(product.name), normalizeSearch(product.code), compactCode(product.code), normalizeSearch(product.size), normalizeSearch(product.material)]
    .filter(Boolean)
    .join(' ');
}

/** The normalized query terms; a product matches when its key contains each. */
export function searchTerms(query: unknown): string[] {
  return String(query ?? '')
    .split(/\s+/)
    .map(normalizeSearch)
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

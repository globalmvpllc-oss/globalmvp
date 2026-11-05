/**
 * Helpers for presenting the signed-in user's company across the application.
 *
 * The product name is CorpControl, but inside the application the user should
 * see their own business. These helpers keep that substitution consistent and
 * give every surface the same fallback behaviour when a company has no name or
 * no logo yet.
 */

/** Product name. Used only where the product itself is meant, never as a company name. */
export const PRODUCT_NAME = 'CorpControl';

/**
 * Up to two initials for a company, for use when no logo has been uploaded.
 * Returns an empty string for a missing name so callers can choose their own
 * fallback rather than rendering something misleading.
 */
export function getCompanyInitials(name?: string | null): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The company's display name, or a neutral fallback while it loads or is unset. */
export function getCompanyDisplayName(name?: string | null, fallback = 'Your business'): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Builds an empty-state message that names the company when one is known.
 *
 * `"No invoices yet"` becomes `"No invoices yet for Acme Furniture"`. Without a
 * company name the base text is returned unchanged, so the copy never reads as
 * though something is missing.
 *
 * ## Word order
 *
 * The join is a `pattern` rather than a hardcoded " for " because the two parts
 * do not sit in the same order in every language: English puts the company last
 * ("No invoices yet for Acme"), Turkish puts it first ("Acme için henüz fatura
 * yok"). Callers pass `t('common.emptyStateFor')`; the default keeps the exact
 * English this has always produced, so an existing caller is unaffected.
 */
export function personalizeEmptyState(
  base: string,
  companyName?: string | null,
  pattern = '{base} for {name}'
): string {
  const trimmed = companyName?.trim();
  if (!trimmed) return base;
  return pattern.split('{base}').join(base).split('{name}').join(trimmed);
}

/**
 * The displayable logo for a stored value. Logos are image data URLs kept in
 * Company.logoUrl; anything else returns null so callers fall back to
 * initials. Async only so existing callers keep working unchanged.
 */
export async function resolveStoredFileUrl(key?: string | null): Promise<string | null> {
  return key && key.startsWith('data:image/') ? key : null;
}

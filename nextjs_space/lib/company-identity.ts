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
 */
export function personalizeEmptyState(base: string, companyName?: string | null): string {
  const trimmed = companyName?.trim();
  return trimmed ? `${base} for ${trimmed}` : base;
}

/**
 * Resolves a signed, time-limited URL for a stored file key.
 *
 * Uploads are private, so the stored value is a storage key rather than
 * something an <img> can load directly. Returns null when there is no key or
 * the file cannot be read, letting callers fall back to initials.
 */
export async function resolveStoredFileUrl(key?: string | null): Promise<string | null> {
  if (!key) return null;
  // Logos are stored inline as data URLs and are already renderable. Only
  // legacy S3 keys need a signed URL fetched for them.
  if (key.startsWith('data:')) return key;
  try {
    const res = await fetch(`/api/upload/view?path=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

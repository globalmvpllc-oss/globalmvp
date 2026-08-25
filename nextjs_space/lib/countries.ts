export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'TR', name: 'Turkey' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'JP', name: 'Japan' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
] as const;

export function getCountryName(code: string): string {
  const c = COUNTRIES.find((c: any) => c.code === code);
  return c?.name ?? code;
}

/**
 * Full name for a stored country code.
 *
 * Country is stored as an ISO code because application logic depends on it —
 * settings shows Turkish tax fields on `country === 'TR'` — but a code is not
 * what a customer should read on an invoice. Displays go through here; storage
 * keeps the code.
 *
 * Unknown or already-expanded values are returned unchanged, so historic rows
 * holding a full name still render sensibly.
 */
export function countryLabel(value?: string | null): string {
  if (!value) return '';
  const match = COUNTRIES.find((c) => c.code === value.toUpperCase());
  return match ? match.name : value;
}

/**
 * Tax-number rule for customers and vendors, shared by their API routes.
 *
 * Pure: the routes pass the company's country in, so this needs no database
 * and is unit-tested directly.
 */
import { isValidTrTaxId, normalizeTaxId, trTaxIdRuleApplies } from '@/lib/tr-tax';

export const TAX_ID_INVALID_MESSAGE =
  'For Turkey, enter a 10-digit tax number or an 11-digit TC ID number.';

export type PartyTaxCheck =
  | { ok: true; taxId: string | undefined }
  | { ok: false; response: { error: string; field: 'taxId'; code: 'TAX_ID_INVALID' } };

/**
 * Checks (and tidies) a party's tax number.
 *
 * - Turkish party (or no country while the business is Turkish): the number
 *   must be 10 (VKN) or 11 (TCKN) digits; spaces and dashes are removed.
 * - Anyone else: stored as typed — EU VAT numbers carry letters.
 * - Empty or absent: always fine, the field is optional.
 */
export function checkPartyTaxId(
  taxId: string | undefined,
  partyCountry: string | undefined | null,
  companyCountry: string | undefined | null
): PartyTaxCheck {
  if (taxId === undefined || taxId.trim() === '') return { ok: true, taxId };
  if (!trTaxIdRuleApplies(partyCountry, companyCountry)) return { ok: true, taxId };
  if (!isValidTrTaxId(taxId)) {
    return {
      ok: false,
      response: { error: TAX_ID_INVALID_MESSAGE, field: 'taxId', code: 'TAX_ID_INVALID' },
    };
  }
  return { ok: true, taxId: normalizeTaxId(taxId) };
}

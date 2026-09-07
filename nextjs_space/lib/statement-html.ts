import { esc, safeBrandColor, safeLogoSrc } from '@/lib/invoice-templates';
import { formatCalendarDateLong } from '@/lib/calendar-date';
import type { CurrencyStatement, MovementKind } from '@/lib/statement-ledger';

/**
 * The printable account statement.
 *
 * Deliberately the same shape as an invoice document: one self-contained HTML
 * string, every interpolated value already escaped, handed to the existing
 * `/api/generate-pdf` with the existing options. There is no second PDF path
 * and no second escaping convention — `esc`, `safeBrandColor` and `safeLogoSrc`
 * are the ones the invoice templates use, so a customer name carrying a `<` is
 * as safe here as it is there.
 *
 * Labels arrive from the caller rather than being written in, because the
 * application is bilingual and a Turkish user's ekstre must print in Turkish.
 * Money is formatted by the caller too, through `formatCurrency`, so the
 * document uses the same separators as the screen it was produced from.
 */

export interface StatementDocumentLabels {
  title: string;
  statementFor: string;
  issued: string;
  period: string;
  allTime: string;
  date: string;
  type: string;
  reference: string;
  debit: string;
  credit: string;
  balance: string;
  opening: string;
  closing: string;
  periodDebit: string;
  periodCredit: string;
  empty: string;
  kind: Record<MovementKind, string>;
}

export interface StatementDocumentInput {
  party: {
    name?: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    taxId?: string | null;
  };
  company?: {
    name?: string | null;
    legalName?: string | null;
    address?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
    taxNumber?: string | null;
    primaryColor?: string | null;
  } | null;
  logoDataUrl?: string | null;
  /** One section per currency, in the order they should print. */
  sections: CurrencyStatement[];
  labels: StatementDocumentLabels;
  /** Formats an amount string in a currency, e.g. through `formatCurrency`. */
  formatAmount: (amount: string, currency: string) => string;
  /** Window the statement covers, as 'YYYY-MM-DD', when one was applied. */
  range?: { from?: string | null; to?: string | null } | null;
  /** The day the document was produced. */
  issuedOn?: Date;
}

/** Joins the non-empty parts of an address-style line. */
function line(...parts: Array<string | null | undefined>): string {
  return parts.filter((part) => typeof part === 'string' && part.trim() !== '').join(', ');
}

function periodLabel(input: StatementDocumentInput): string {
  const from = input.range?.from;
  const to = input.range?.to;
  if (!from && !to) return input.labels.allTime;
  const start = from ? formatCalendarDateLong(from) : '…';
  // The window is half-open, so the last day it covers is the one before `to`.
  const end = to ? formatCalendarDateLong(shiftBackOneDay(to)) : '…';
  return `${start} – ${end}`;
}

function shiftBackOneDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function renderSection(input: StatementDocumentInput, section: CurrencyStatement): string {
  const { labels, formatAmount } = input;
  const money = (amount: string) => esc(formatAmount(amount, section.currency));

  const rows = section.rows
    .map((row) => {
      const reference = esc(row.reference);
      const detail = row.description ? `<div class="detail">${esc(row.description)}</div>` : '';
      return `<tr>
        <td class="nowrap">${esc(formatCalendarDateLong(row.date))}</td>
        <td class="nowrap">${esc(labels.kind[row.kind] ?? row.kind)}</td>
        <td>${reference}${detail}</td>
        <td class="num">${row.debit === '0.00' ? '' : money(row.debit)}</td>
        <td class="num">${row.credit === '0.00' ? '' : money(row.credit)}</td>
        <td class="num strong">${money(row.balance)}</td>
      </tr>`;
    })
    .join('');

  const body =
    section.rows.length > 0
      ? rows
      : `<tr><td colspan="6" class="empty">${esc(labels.empty)}</td></tr>`;

  return `<section class="statement">
    <h2>${esc(section.currency)}</h2>
    <table>
      <thead><tr>
        <th>${esc(labels.date)}</th>
        <th>${esc(labels.type)}</th>
        <th>${esc(labels.reference)}</th>
        <th class="num">${esc(labels.debit)}</th>
        <th class="num">${esc(labels.credit)}</th>
        <th class="num">${esc(labels.balance)}</th>
      </tr></thead>
      <tbody>
        <tr class="opening">
          <td colspan="5">${esc(labels.opening)}</td>
          <td class="num strong">${money(section.opening)}</td>
        </tr>
        ${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">${esc(labels.periodDebit)} / ${esc(labels.periodCredit)}</td>
          <td class="num">${money(section.debitTotal)}</td>
          <td class="num">${money(section.creditTotal)}</td>
          <td></td>
        </tr>
        <tr class="closing">
          <td colspan="5">${esc(labels.closing)}</td>
          <td class="num">${money(section.closing)}</td>
        </tr>
      </tfoot>
    </table>
  </section>`;
}

export function generateStatementHtml(input: StatementDocumentInput): string {
  const brand = safeBrandColor(input.company?.primaryColor);
  const logo = safeLogoSrc(input.logoDataUrl);
  const issued = formatCalendarDateLong(input.issuedOn ?? new Date());

  const partyLines = [
    input.party.companyName,
    input.party.email,
    input.party.phone,
    line(input.party.address, input.party.city, input.party.country),
    input.party.taxId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => `<p>${esc(value)}</p>`)
    .join('');

  const companyLines = [
    input.company?.legalName,
    line(input.company?.address, input.company?.city),
    line(input.company?.email, input.company?.phone),
    input.company?.taxNumber,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => `<p>${esc(value)}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111111; font-size: 12px; line-height: 1.6; }
  .sheet { padding: 40px 40px 32px; }
  .head { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 8px; }
  .doc { font-size: 26px; font-weight: 300; letter-spacing: -0.4px; }
  .meta { text-align: right; color: #555555; font-size: 11.5px; }
  .accent { height: 3px; background: ${brand}; margin: 14px 0 22px; }
  .parties { display: flex; gap: 40px; margin-bottom: 26px; }
  .party { flex: 1; }
  .party h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.3px; color: #999999; margin-bottom: 5px; font-weight: 400; }
  .party .name { font-weight: 600; }
  .party p { color: #555555; font-size: 11.5px; }
  section.statement { margin-bottom: 26px; page-break-inside: auto; }
  section.statement h2 { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: #777777; font-weight: 600; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 0 6px 7px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #999999; font-weight: 400; border-bottom: 1px solid #cccccc; }
  td { padding: 8px 6px; border-bottom: 1px solid #f2f2f2; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .strong { font-weight: 600; }
  .detail { color: #888888; font-size: 10.5px; }
  .opening td { color: #555555; background: #fafafa; }
  .empty { text-align: center; color: #999999; padding: 18px 6px; }
  tfoot td { border-bottom: none; border-top: 1px solid #cccccc; color: #555555; }
  tfoot tr.closing td { font-size: 14px; font-weight: 600; color: #111111; border-top: none; }
  .footer { margin-top: 28px; font-size: 10px; color: #aaaaaa; }
</style></head><body>
<div class="sheet">
  <div class="head">
    <div>
      ${logo ? `<img src="${logo}" alt="" style="max-height:38px;max-width:150px;object-fit:contain;margin-bottom:12px;display:block" />` : ''}
      <div class="doc">${esc(input.labels.title)}</div>
    </div>
    <div class="meta">
      <div>${esc(input.labels.issued)}: ${esc(issued)}</div>
      <div>${esc(input.labels.period)}: ${esc(periodLabel(input))}</div>
    </div>
  </div>
  <div class="accent"></div>
  <div class="parties">
    <div class="party">
      <h3>${esc(input.labels.statementFor)}</h3>
      <p class="name">${esc(input.party.name ?? '')}</p>
      ${partyLines}
    </div>
    <div class="party">
      <h3>${esc(input.company?.name ?? '')}</h3>
      ${companyLines}
    </div>
  </div>
  ${input.sections.map((section) => renderSection(input, section)).join('')}
  <div class="footer">${esc(input.company?.name ?? '')}</div>
</div>
</body></html>`;
}

/**
 * Account statement (cari hesap ekstresi) → PDF, built on the server from the
 * same ledger the statement screen shows.
 */
import { formatCalendarDateLong } from '@/lib/calendar-date';
import { countryLabel } from '@/lib/countries';

/** Country name in the document's language ("Türkiye" / "Turkey"). */
function countryName(code: string, locale: 'tr' | 'en'): string {
  try {
    const name = new Intl.DisplayNames([locale === 'tr' ? 'tr-TR' : 'en-US'], { type: 'region' }).of(code.toUpperCase());
    if (name && name !== code.toUpperCase()) return name;
  } catch {
    // fall through
  }
  return countryLabel(code);
}
import { translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/email/templates';
import { paymentMethodLabelKey } from '@/lib/validation';
import type { CurrencyStatement, MovementKind } from '@/lib/statement-ledger';
import { logoFromDataUrl, renderBusinessDocumentPdf, type BusinessDocumentSpec, type DocBlock } from './engine';

const KIND_KEYS: Record<MovementKind, TranslationKey> = {
  invoice: 'statement.kind.invoice',
  expense: 'statement.kind.expense',
  income: 'statement.kind.income',
  payment: 'statement.kind.payment',
  settlement: 'statement.kind.settlement',
};

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export interface StatementPdfInput {
  locale: Locale;
  party: {
    name?: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    taxId?: string | null;
    taxOffice?: string | null;
  };
  company: any;
  sections: CurrencyStatement[];
  range?: { from?: string | null; to?: string | null } | null;
  issuedOn?: Date;
}

function shiftBackOneDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function buildStatementPdfSpec(input: StatementPdfInput): BusinessDocumentSpec {
  const { locale, company } = input;
  const t = (key: TranslationKey) => translate(locale, key);
  const intl = locale === 'tr' ? 'tr-TR' : undefined;
  const date = (v: unknown) => formatCalendarDateLong(v, intl);

  const from = input.range?.from;
  const to = input.range?.to;
  const period =
    !from && !to
      ? t('statement.allTime')
      : `${from ? date(from) : '…'} – ${to ? date(shiftBackOneDay(to)) : '…'}`;

  const blocks: DocBlock[] = input.sections.map((section) => {
    const money = (amount: string) => formatMoney(amount, section.currency, locale);
    return {
      kind: 'table',
      heading: section.currency,
      columns: [
        { label: t('statement.date'), width: 17 },
        { label: t('statement.type'), width: 14 },
        { label: t('statement.reference'), width: 27 },
        { label: t('statement.debit'), width: 14, align: 'right' },
        { label: t('statement.credit'), width: 14, align: 'right' },
        { label: t('statement.balance'), width: 14, align: 'right' },
      ],
      rows: [
        { cells: [t('statement.opening'), '', '', '', '', money(section.opening)], style: 'strong' },
        ...section.rows.map((row) => ({
          cells: [
            date(row.date),
            t(KIND_KEYS[row.kind] ?? 'statement.kind.payment'),
            row.kind === 'payment' ? t(paymentMethodLabelKey(row.reference)) : String(row.reference ?? ''),
            row.debit === '0.00' ? '' : money(row.debit),
            row.credit === '0.00' ? '' : money(row.credit),
            money(row.balance),
          ],
          detail: row.description || undefined,
        })),
        {
          cells: [`${t('statement.periodDebit')} / ${t('statement.periodCredit')}`, '', '', money(section.debitTotal), money(section.creditTotal), ''],
          style: 'muted' as const,
        },
        { cells: [t('statement.closing'), '', '', '', '', money(section.closing)], style: 'strong' as const },
      ],
    };
  });
  if (blocks.length === 0) blocks.push({ kind: 'text', body: t('statement.emptyWindow') });

  const party = input.party;
  const partyLines = [
    party.companyName,
    party.email,
    party.phone,
    [party.address, party.city, nonEmpty(party.country) ? countryName(party.country, locale) : null].filter(nonEmpty).join(', '),
    [nonEmpty(party.taxId) ? `${t('pdf.taxId')}: ${party.taxId}` : '', nonEmpty(party.taxOffice) ? `${t('pdf.taxOffice')}: ${party.taxOffice}` : '']
      .filter(Boolean)
      .join(' • '),
  ].filter(nonEmpty);

  const issuerLines = [
    nonEmpty(company?.legalName) && company.legalName !== company?.name ? company.legalName : null,
    [company?.address, company?.city].filter(nonEmpty).join(', '),
    [company?.email, company?.phone].filter(nonEmpty).join(' • '),
    nonEmpty(company?.taxNumber)
      ? [`${t('pdf.taxId')}: ${company.taxNumber}`, nonEmpty(company?.taxOffice) ? `${t('pdf.taxOffice')}: ${company.taxOffice}` : '']
          .filter(Boolean)
          .join(' • ')
      : null,
  ].filter(nonEmpty);

  return {
    title: t('statement.title'),
    brandColor: company?.primaryColor,
    logo: company?.invoiceShowLogo === false ? null : logoFromDataUrl(company?.logoUrl),
    issuer: { name: String(company?.name ?? ''), lines: issuerLines },
    party: { heading: t('statement.statementFor'), name: String(party.name ?? ''), lines: partyLines },
    meta: [
      { label: t('statement.issued'), value: date(input.issuedOn ?? new Date()) },
      { label: t('statement.periodLabel'), value: period },
    ],
    blocks,
    footer: String(company?.invoiceFooter || company?.name || ''),
    pageLabel: translate(locale, 'pdf.page'),
    metadata: { title: t('statement.title'), author: String(company?.name ?? ''), language: locale === 'tr' ? 'tr-TR' : 'en-US' },
  };
}

export function renderStatementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  return renderBusinessDocumentPdf(buildStatementPdfSpec(input));
}

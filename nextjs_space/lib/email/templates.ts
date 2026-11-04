/**
 * Customer- and user-facing emails, in Turkish or English.
 *
 * Pure: no Resend, no database. The words live in the i18n dictionaries
 * (`email.*`), so both languages are parity-checked like the rest of the app.
 * Every interpolated value is escaped for the HTML part.
 */
import { fillTranslation, translate, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatCalendarDateLong } from '@/lib/calendar-date';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "1.250,00 ₺" / "$1,250.00". Falls back to "1250.00 XYZ" for an odd code. */
export function formatMoney(amount: unknown, currency: string, locale: Locale): string {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${(Number.isFinite(value) ? value : 0).toFixed(2)} ${currency}`;
  }
}

/** A calendar date ("5 Kasım 2026" / "November 5, 2026"). */
export function formatEmailDate(value: unknown, locale: Locale): string {
  return locale === 'tr' ? formatCalendarDateLong(value, 'tr-TR') : formatCalendarDateLong(value);
}

/** Builds text + html from paragraphs; values are already filled in. */
function compose(subject: string, paragraphs: string[], extraHtml = ''): RenderedEmail {
  const text = paragraphs.join('\n\n');
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a1a2e;max-width:560px">' +
    paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('') +
    extraHtml +
    '</div>';
  return { subject, text, html };
}

function fill(locale: Locale, key: TranslationKey, values: Record<string, string | number> = {}) {
  return fillTranslation(locale, key, values);
}

export interface InvoiceEmailInput {
  locale: Locale;
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  amountDue: unknown;
  currency: string;
  dueDate: unknown;
  /** Turkish company, not yet an official e-document: say "proforma". */
  proforma?: boolean;
}

/** The email that carries an invoice PDF. */
export function invoiceEmail(input: InvoiceEmailInput): RenderedEmail {
  const { locale } = input;
  const amount = formatMoney(input.amountDue, input.currency, locale);
  const dueDate = formatEmailDate(input.dueDate, locale);
  return compose(
    fill(locale, input.proforma ? 'email.invoice.subjectProforma' : 'email.invoice.subject', {
      number: input.invoiceNumber,
      company: input.companyName,
    }),
    [
      fill(locale, 'email.greeting', { name: input.customerName }),
      fill(locale, input.proforma ? 'email.invoice.bodyProforma' : 'email.invoice.body', {
        number: input.invoiceNumber,
        amount,
        dueDate,
      }),
      translate(locale, 'email.invoice.closing'),
      `${translate(locale, 'email.signoff')}\n${input.companyName}`,
      fill(locale, 'email.footer', { company: input.companyName }),
    ]
  );
}

export interface QuoteEmailInput {
  locale: Locale;
  companyName: string;
  customerName: string;
  quoteNumber: string;
  total: unknown;
  currency: string;
  validUntil: unknown;
}

/** The email that carries a quote PDF. */
export function quoteEmail(input: QuoteEmailInput): RenderedEmail {
  const { locale } = input;
  const amount = formatMoney(input.total, input.currency, locale);
  const validUntil = formatEmailDate(input.validUntil, locale);
  return compose(
    fill(locale, 'email.quote.subject', { number: input.quoteNumber, company: input.companyName }),
    [
      fill(locale, 'email.greeting', { name: input.customerName }),
      fill(locale, 'email.quote.body', { number: input.quoteNumber, amount, validUntil }),
      translate(locale, 'email.quote.closing'),
      `${translate(locale, 'email.signoff')}\n${input.companyName}`,
      fill(locale, 'email.footer', { company: input.companyName }),
    ]
  );
}

export type ReminderKind = 'overdue' | 'followup';

/** The polite payment reminder for an overdue invoice. */
export function paymentReminderEmail(input: InvoiceEmailInput & { kind: ReminderKind }): RenderedEmail {
  const { locale } = input;
  const amount = formatMoney(input.amountDue, input.currency, locale);
  const dueDate = formatEmailDate(input.dueDate, locale);
  const bodyKey: TranslationKey = input.proforma
    ? input.kind === 'followup'
      ? 'email.reminder.bodyFollowUpProforma'
      : 'email.reminder.bodyOverdueProforma'
    : input.kind === 'followup'
      ? 'email.reminder.bodyFollowUp'
      : 'email.reminder.bodyOverdue';
  return compose(
    fill(locale, input.proforma ? 'email.reminder.subjectProforma' : 'email.reminder.subject', {
      number: input.invoiceNumber,
    }),
    [
      fill(locale, 'email.greeting', { name: input.customerName }),
      fill(locale, bodyKey, { number: input.invoiceNumber, amount, dueDate }),
      translate(locale, 'email.reminder.closing'),
      `${translate(locale, 'email.signoff')}\n${input.companyName}`,
      fill(locale, 'email.footer', { company: input.companyName }),
    ]
  );
}

export interface CalendarReminderInput {
  locale: Locale;
  userName: string;
  title: string;
  startAt: Date | string;
  calendarUrl: string;
}

/** The morning-of reminder for a calendar entry, sent to the user. */
export function calendarReminderEmail(input: CalendarReminderInput): RenderedEmail {
  const { locale } = input;
  const date = formatEmailDate(input.startAt, locale);
  const url = escapeHtml(input.calendarUrl);
  const link = `<p style="margin:0 0 14px"><a href="${url}" style="color:#7C3AED">${escapeHtml(
    translate(locale, 'email.calendar.open')
  )}</a></p>`;
  const rendered = compose(
    fill(locale, 'email.calendar.subject', { title: input.title }),
    [
      fill(locale, 'email.greeting', { name: input.userName }),
      fill(locale, 'email.calendar.body', { title: input.title, date }),
    ],
    link +
      `<p style="margin:0;font-size:13px;color:#777">${escapeHtml(translate(locale, 'email.calendar.footer'))}</p>`
  );
  return {
    ...rendered,
    text:
      rendered.text +
      `\n\n${translate(locale, 'email.calendar.open')}: ${input.calendarUrl}\n\n` +
      translate(locale, 'email.calendar.footer'),
  };
}

function linkButton(url: string, label: string): string {
  return `<p style="margin:0 0 18px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

export interface AccountantInviteInput {
  locale: Locale;
  companyName: string;
  inviterName: string;
  url: string;
}

/** Invitation for an accountant (mali müşavir): one clear button, 7-day note. */
export function accountantInviteEmail(input: AccountantInviteInput): RenderedEmail {
  const { locale } = input;
  const cta = translate(locale, 'email.acc.cta');
  const footer = translate(locale, 'email.acc.footer');
  const rendered = compose(
    fill(locale, 'email.acc.subject', { company: input.companyName }),
    [fill(locale, 'email.acc.body', { inviter: input.inviterName, company: input.companyName })],
    linkButton(input.url, cta) + `<p style="margin:0;font-size:14px;color:#777">${escapeHtml(footer)}</p>`
  );
  return { ...rendered, text: `${rendered.text}\n\n${cta}: ${input.url}\n\n${footer}` };
}

export interface TrialReminderInput {
  locale: Locale;
  kind: 'soon' | 'ended';
  companyName: string;
  endsAt: Date;
  url: string;
}

/** "2 days left" and "ended today" for the free Pro trial. */
export function trialReminderEmail(input: TrialReminderInput): RenderedEmail {
  const { locale } = input;
  const cta = translate(locale, 'email.trial.cta');
  const rendered = compose(
    translate(locale, input.kind === 'soon' ? 'email.trial.soonSubject' : 'email.trial.endedSubject'),
    [
      fill(locale, input.kind === 'soon' ? 'email.trial.soonBody' : 'email.trial.endedBody', {
        company: input.companyName,
        date: formatEmailDate(input.endsAt, locale),
      }),
    ],
    linkButton(input.url, cta)
  );
  return { ...rendered, text: `${rendered.text}\n\n${cta}: ${input.url}` };
}

export interface StockLowAlertInput {
  locale: Locale;
  companyName: string;
  product: { code: string; name: string; unit: string; quantity: number; minStock: number };
  url: string;
}

/** Avc KolayStok: one product has dropped to its minimum. Sent once per dip. */
export function stockLowAlertEmail(input: StockLowAlertInput): RenderedEmail {
  const { locale, product } = input;
  const cta = translate(locale, 'ks.alert.cta');
  const rendered = compose(
    fill(locale, 'ks.alert.subject', { name: product.name, code: product.code }),
    [
      fill(locale, 'ks.alert.body', {
        company: input.companyName,
        name: product.name,
        code: product.code,
        quantity: product.quantity,
        unit: product.unit,
        min: product.minStock,
      }),
    ],
    linkButton(input.url, cta)
  );
  return { ...rendered, text: `${rendered.text}\n\n${cta}: ${input.url}` };
}

/** After "reset all stock": what happened, with the Excel backup attached. */
export function stockResetEmail(input: { locale: Locale; companyName: string; products: number; by: string }): RenderedEmail {
  const { locale } = input;
  return compose(fill(locale, 'ks.mail.resetSubject', { company: input.companyName }), [
    fill(locale, 'ks.mail.resetBody', { company: input.companyName, by: input.by, products: input.products }),
    translate(locale, 'ks.mail.resetUndo'),
  ]);
}

export interface StockOrderLine {
  code: string;
  name: string;
  unit: string;
  quantity: number;
}

/** A purchase order to a supplier, prepared by the manager and sent only after they confirm. */
export function stockOrderEmail(input: {
  locale: Locale;
  companyName: string;
  supplierName: string;
  lines: StockOrderLine[];
  note?: string | null;
}): RenderedEmail {
  const { locale } = input;
  const qty = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 3 }).format(n);
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(l.code)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(l.name)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(qty(l.quantity))} ${escapeHtml(l.unit)}</td></tr>`
    )
    .join('');
  const table =
    `<table style="border-collapse:collapse;margin:0 0 16px;font-size:15px"><thead><tr>` +
    `<th style="text-align:left;padding:6px 10px">${escapeHtml(translate(locale, 'ks.product.code'))}</th>` +
    `<th style="text-align:left;padding:6px 10px">${escapeHtml(translate(locale, 'ks.product.name'))}</th>` +
    `<th style="text-align:right;padding:6px 10px">${escapeHtml(translate(locale, 'ks.qty.amount'))}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const paragraphs = [
    fill(locale, 'ks.mail.orderGreeting', { supplier: input.supplierName }),
    fill(locale, 'ks.mail.orderBody', { company: input.companyName }),
  ];
  const rendered = compose(fill(locale, 'ks.mail.orderSubject', { company: input.companyName }), paragraphs, table +
    (input.note ? `<p style="margin:0 0 14px">${escapeHtml(input.note)}</p>` : '') +
    `<p style="margin:0">${escapeHtml(fill(locale, 'ks.mail.orderThanks', { company: input.companyName }))}</p>`);
  const textLines = input.lines.map((l) => `- ${l.code}  ${l.name}: ${qty(l.quantity)} ${l.unit}`).join('\n');
  return {
    ...rendered,
    text: `${paragraphs.join('\n\n')}\n\n${textLines}\n\n${input.note ? `${input.note}\n\n` : ''}${fill(locale, 'ks.mail.orderThanks', { company: input.companyName })}`,
  };
}

/** The 07:00 summary: critical and out-of-stock products. */
export function stockDailyEmail(input: {
  locale: Locale;
  companyName: string;
  low: Array<{ code: string; name: string; quantity: number; unit: string }>;
  out: Array<{ code: string; name: string; unit: string }>;
  url: string;
}): RenderedEmail {
  const { locale } = input;
  const list = (items: string[]) => `<ul style="margin:0 0 14px;padding-left:20px">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
  const lowItems = input.low.map((p) => `${p.code} ${p.name}: ${p.quantity} ${p.unit}`);
  const outItems = input.out.map((p) => `${p.code} ${p.name}`);
  const cta = translate(locale, 'ks.alert.cta');
  const rendered = compose(
    fill(locale, 'ks.mail.dailySubject', { company: input.companyName, low: input.low.length, out: input.out.length }),
    [fill(locale, 'ks.mail.dailyBody', { low: input.low.length, out: input.out.length })],
    (input.out.length ? `<p style="margin:0 0 6px;font-weight:bold">${escapeHtml(translate(locale, 'ks.tile.out'))}</p>${list(outItems.slice(0, 100))}` : '') +
      (input.low.length ? `<p style="margin:0 0 6px;font-weight:bold">${escapeHtml(translate(locale, 'ks.tile.low'))}</p>${list(lowItems.slice(0, 100))}` : '') +
      linkButton(input.url, cta)
  );
  return {
    ...rendered,
    text: `${rendered.text}\n\n${translate(locale, 'ks.tile.out')}:\n${outItems.join('\n')}\n\n${translate(locale, 'ks.tile.low')}:\n${lowItems.join('\n')}\n\n${cta}: ${input.url}`,
  };
}

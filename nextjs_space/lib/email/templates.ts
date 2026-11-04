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
}

/** The email that carries an invoice PDF. */
export function invoiceEmail(input: InvoiceEmailInput): RenderedEmail {
  const { locale } = input;
  const amount = formatMoney(input.amountDue, input.currency, locale);
  const dueDate = formatEmailDate(input.dueDate, locale);
  return compose(
    fill(locale, 'email.invoice.subject', { number: input.invoiceNumber, company: input.companyName }),
    [
      fill(locale, 'email.greeting', { name: input.customerName }),
      fill(locale, 'email.invoice.body', { number: input.invoiceNumber, amount, dueDate }),
      translate(locale, 'email.invoice.closing'),
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
  const bodyKey: TranslationKey =
    input.kind === 'followup' ? 'email.reminder.bodyFollowUp' : 'email.reminder.bodyOverdue';
  return compose(
    fill(locale, 'email.reminder.subject', { number: input.invoiceNumber }),
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

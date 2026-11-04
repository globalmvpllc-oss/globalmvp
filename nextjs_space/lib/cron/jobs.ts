import 'server-only';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { calendarReminderEmail, invoiceEmail, paymentReminderEmail } from '@/lib/email/templates';
import { checkPlanLimit } from '@/lib/billing/limits';
import { allocateInvoiceNumber, type TxClient } from '@/lib/invoice-number';
import { computeLineItems, itemsFromRows } from '@/lib/line-items';
import { afterRun, dueDateFor, isRecurringDue } from '@/lib/recurring';
import { documentLocaleFor, isProformaInvoice } from '@/lib/tr-tax';
import { resolveLocale } from '@/lib/i18n';
import { getBaseUrl } from '@/lib/site';
import { renderInvoicePdf, invoicePdfFileName } from '@/lib/pdf/invoice-pdf';
import { COMPANY_DOCUMENT_SELECT } from '@/lib/pdf/response';
import {
  OVERDUE_SOURCE_STATUSES,
  FOLLOW_UP_LAST_DAY,
  calendarReminderDue,
  calendarReminderWindow,
  reminderDue,
  startOfUtcDay,
} from './rules';

/**
 * The three things the daily cron does. Each one is independent and safe to
 * run twice: every email is "claimed" by stamping its row before it is sent,
 * with the stamp as part of the WHERE clause, so a second concurrent run finds
 * nothing to claim. A send that fails releases its claim for the next run.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

/** SENT / VIEWED / PARTIALLY_PAID past their due date and not fully paid → OVERDUE. */
export async function markOverdueInvoices(now: Date): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: [...OVERDUE_SOURCE_STATUSES] },
      dueDate: { lt: startOfUtcDay(now) },
      // Column comparison: still money owing. amountPaid itself is never
      // touched, so a partly paid invoice keeps exactly what remains.
      amountPaid: { lt: prisma.invoice.fields.total },
    },
    data: { status: 'OVERDUE' },
  });
  return result.count;
}

/** Polite reminders to customers, for companies that switched them on. */
export async function sendPaymentReminders(now: Date): Promise<{ sent: number; failed: number }> {
  const today = startOfUtcDay(now).getTime();
  const candidates = await prisma.invoice.findMany({
    where: {
      status: 'OVERDUE',
      company: { paymentRemindersEnabled: true },
      customer: { email: { not: null } },
      dueDate: { gte: new Date(today - FOLLOW_UP_LAST_DAY * DAY_MS), lt: new Date(today) },
      OR: [{ overdueReminderSentAt: null }, { followUpReminderSentAt: null }],
    },
    // The whole invoice, because the reminder carries the invoice PDF.
    include: {
      items: true,
      customer: true,
      company: { select: COMPANY_DOCUMENT_SELECT },
    },
    take: BATCH,
    orderBy: { dueDate: 'asc' },
  });

  let sent = 0;
  let failed = 0;
  for (const invoice of candidates) {
    const kind = reminderDue(invoice, now);
    const to = invoice.customer?.email;
    if (!kind || !to) continue;

    const stamp = kind === 'followup' ? 'followUpReminderSentAt' : 'overdueReminderSentAt';
    const claimed = await prisma.invoice.updateMany({
      where: { id: invoice.id, status: 'OVERDUE', [stamp]: null },
      data: { [stamp]: now },
    });
    if (claimed.count !== 1) continue;

    const locale = documentLocaleFor(invoice.customer, invoice.company);
    const email = paymentReminderEmail({
      kind,
      locale,
      companyName: invoice.company.name,
      customerName: invoice.customer.name,
      invoiceNumber: invoice.invoiceNumber,
      amountDue: Number(invoice.total) - Number(invoice.amountPaid),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      proforma: isProformaInvoice(invoice, invoice.company),
    });
    // The PDF is a courtesy: if it cannot be built the reminder still goes.
    let attachments: Array<{ filename: string; content: Buffer }> | undefined;
    try {
      const pdf = await renderInvoicePdf(invoice, invoice.company);
      attachments = [{ filename: invoicePdfFileName(invoice.invoiceNumber), content: Buffer.from(pdf) }];
    } catch (pdfError) {
      console.error('[cron] reminder pdf failed', { name: (pdfError as { name?: string })?.name });
    }
    const result = await sendMail({
      to,
      ...email,
      replyTo: invoice.company.email,
      senderName: invoice.company.name,
      attachments,
      idempotencyKey: `reminder-${kind}-${invoice.id}`,
    });
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      await prisma.invoice.updateMany({ where: { id: invoice.id }, data: { [stamp]: null } });
    }
  }
  return { sent, failed };
}

/** Calendar reminders: the morning of reminderAt, to the person who set it. */
export async function sendCalendarReminders(now: Date): Promise<{ sent: number; failed: number }> {
  const window = calendarReminderWindow(now);
  const events = await prisma.event.findMany({
    where: { reminderAt: { gte: window.gte, lt: window.lt }, reminderSentAt: null },
    select: {
      id: true,
      title: true,
      startAt: true,
      reminderAt: true,
      reminderSentAt: true,
      status: true,
      companyId: true,
      createdBy: { select: { email: true, name: true, language: true, isActive: true } },
    },
    take: BATCH,
    orderBy: { reminderAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;
  for (const event of events) {
    if (!calendarReminderDue(event, now)) continue;

    // The person who created it; if that account is gone, the company owners.
    let recipients: Array<{ email: string; name: string | null; language: string }> = [];
    if (event.createdBy?.isActive && event.createdBy.email) {
      recipients = [event.createdBy];
    } else {
      const owners = await prisma.companyMember.findMany({
        where: { companyId: event.companyId, role: 'owner', user: { isActive: true } },
        select: { user: { select: { email: true, name: true, language: true } } },
      });
      recipients = owners.map((o) => o.user).filter((u) => Boolean(u.email));
    }
    if (recipients.length === 0) continue;

    const claimed = await prisma.event.updateMany({
      where: { id: event.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;

    let anyOk = false;
    for (const user of recipients) {
      const locale = resolveLocale(user.language);
      const email = calendarReminderEmail({
        locale,
        userName: user.name || user.email,
        title: event.title,
        startAt: event.startAt,
        calendarUrl: `${getBaseUrl()}/calendar`,
      });
      const result = await sendMail({ to: user.email, ...email, idempotencyKey: `event-${event.id}-${user.email}` });
      if (result.ok) anyOk = true;
    }
    if (anyOk) {
      sent += 1;
    } else {
      failed += 1;
      await prisma.event.updateMany({ where: { id: event.id }, data: { reminderSentAt: null } });
    }
  }
  return { sent, failed };
}

/** SENT quotes whose valid-until date has passed → EXPIRED. */
export async function expireQuotes(now: Date): Promise<number> {
  const result = await prisma.quote.updateMany({
    where: { status: 'SENT', validUntil: { lt: startOfUtcDay(now) }, convertedInvoiceId: null },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/**
 * Recurring templates that are due today produce a DRAFT invoice each.
 *
 * - One invoice per template per run. A template that is several periods
 *   behind catches up one period a day, so nothing is skipped silently.
 * - Claim and create happen in one transaction: the template's nextRunDate is
 *   moved forward only by a write that still sees the old date, so two runs
 *   cannot both produce the same period, and a failed create loses nothing.
 * - The plan's monthly invoice allowance is respected; a template over the
 *   limit simply waits.
 * - autoSend (off by default) emails the invoice with its PDF and marks it
 *   SENT; if that fails the invoice stays a DRAFT for the user to send.
 */
export async function generateRecurringInvoices(now: Date): Promise<{ created: number; sent: number; skipped: number }> {
  const today = startOfUtcDay(now);
  const due = await prisma.recurringInvoice.findMany({
    where: { isActive: true, nextRunDate: { lte: today } },
    include: { items: { orderBy: { position: 'asc' } }, customer: true },
    take: BATCH,
    orderBy: { nextRunDate: 'asc' },
  });

  let created = 0;
  let sent = 0;
  let skipped = 0;
  for (const template of due) {
    if (!isRecurringDue(template, now)) {
      // Past its end date: switch it off so it is not looked at again.
      await prisma.recurringInvoice.updateMany({ where: { id: template.id, nextRunDate: template.nextRunDate }, data: { isActive: false } });
      continue;
    }
    const verdict = await checkPlanLimit(template.companyId, 'invoicesPerMonth');
    if (!verdict.allowed) {
      skipped += 1;
      continue;
    }

    const { totals, rows, errors } = computeLineItems(itemsFromRows(template.items));
    if (errors.length > 0 || rows.length === 0) {
      skipped += 1;
      continue;
    }
    const issueDate = new Date(template.nextRunDate);
    const next = afterRun(template);

    const invoice = await prisma.$transaction(async (tx: TxClient) => {
      const claimed = await tx.recurringInvoice.updateMany({
        where: { id: template.id, isActive: true, nextRunDate: template.nextRunDate },
        data: { nextRunDate: next.nextRunDate, isActive: next.isActive, lastRunAt: now, runCount: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;
      const invoiceNumber = await allocateInvoiceNumber(tx, template.companyId);
      return tx.invoice.create({
        data: {
          companyId: template.companyId,
          customerId: template.customerId,
          recurringInvoiceId: template.id,
          invoiceNumber,
          status: 'DRAFT',
          issueDate,
          dueDate: dueDateFor(issueDate, template.paymentTermsDays),
          currency: template.currency,
          ...totals,
          notes: template.notes,
          items: { create: rows },
        },
        include: { items: true, customer: true },
      });
    });
    if (!invoice) continue;
    created += 1;

    if (template.autoSend && invoice.customer?.email) {
      try {
        const company = await prisma.company.findUnique({
          where: { id: template.companyId },
          select: COMPANY_DOCUMENT_SELECT,
        });
        if (!company) continue;
        const pdf = await renderInvoicePdf(invoice, company);
        const locale = documentLocaleFor(invoice.customer, company);
        const result = await sendMail({
          to: invoice.customer.email,
          ...invoiceEmail({
            locale,
            companyName: company.name,
            customerName: invoice.customer.name,
            invoiceNumber: invoice.invoiceNumber,
            amountDue: invoice.total,
            currency: invoice.currency,
            dueDate: invoice.dueDate,
            proforma: isProformaInvoice(invoice, company),
          }),
          replyTo: company.email,
          senderName: company.name,
          attachments: [{ filename: invoicePdfFileName(invoice.invoiceNumber), content: Buffer.from(pdf) }],
          idempotencyKey: `recurring-${invoice.id}`,
        });
        if (result.ok) {
          await prisma.invoice.updateMany({
            where: { id: invoice.id, status: 'DRAFT' },
            data: { status: 'SENT', sentAt: new Date() },
          });
          sent += 1;
        }
      } catch (sendError) {
        console.error('[cron] recurring auto-send failed', { name: (sendError as { name?: string })?.name });
      }
    }
  }
  return { created, sent, skipped };
}

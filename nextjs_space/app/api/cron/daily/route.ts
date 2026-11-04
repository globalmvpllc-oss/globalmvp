export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron/auth';
import {
  expireQuotes,
  generateRecurringInvoices,
  markOverdueInvoices,
  sendCalendarReminders,
  sendPaymentReminders,
} from '@/lib/cron/jobs';
import { sendTrialReminders } from '@/lib/cron/trial-reminders';

/**
 * The daily job (Vercel Cron, see vercel.json).
 *
 * 1. Overdue invoices are marked OVERDUE.
 * 2. Payment reminders go to customers of companies that turned them on.
 * 3. Calendar reminders go to users.
 * 4. Sent quotes past their valid-until date are marked EXPIRED.
 * 5. Recurring templates that are due produce their invoice.
 *
 * Protected by CRON_SECRET: Vercel sends it as a Bearer token. Without the
 * secret configured, every call is refused. Each step runs on its own, so one
 * failing does not stop the others; the response carries counts only.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const report: Record<string, unknown> = {};

  try {
    report.overdue = await markOverdueInvoices(now);
  } catch (error) {
    console.error('[cron] overdue step failed', { code: (error as { code?: string })?.code });
    report.overdue = 'failed';
  }
  try {
    report.paymentReminders = await sendPaymentReminders(now);
  } catch (error) {
    console.error('[cron] payment reminder step failed', { code: (error as { code?: string })?.code });
    report.paymentReminders = 'failed';
  }
  try {
    report.calendarReminders = await sendCalendarReminders(now);
  } catch (error) {
    console.error('[cron] calendar reminder step failed', { code: (error as { code?: string })?.code });
    report.calendarReminders = 'failed';
  }

  try {
    report.expiredQuotes = await expireQuotes(now);
  } catch (error) {
    console.error('[cron] quote expiry step failed', { code: (error as { code?: string })?.code });
    report.expiredQuotes = 'failed';
  }
  try {
    report.recurring = await generateRecurringInvoices(now);
  } catch (error) {
    console.error('[cron] recurring step failed', { code: (error as { code?: string })?.code });
    report.recurring = 'failed';
  }

  try {
    report.trialReminders = await sendTrialReminders(now);
  } catch (error) {
    console.error('[cron] trial reminder step failed', { code: (error as { code?: string })?.code });
    report.trialReminders = 'failed';
  }

  return NextResponse.json({ ok: true, ...report });
}

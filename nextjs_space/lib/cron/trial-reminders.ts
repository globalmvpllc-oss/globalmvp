import 'server-only';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { trialReminderEmail } from '@/lib/email/templates';
import { getBaseUrl } from '@/lib/site';
import { resolveTrialAnchor } from '@/lib/billing/trial-anchor';
import { SEVEN_DAY_TRIAL_FROM, trialEndsAt, trialReminderKind } from '@/lib/billing/trial';
import type { Locale } from '@/lib/i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Trial reminder emails: "2 days left" and "ended today", once each.
 *
 * Only companies on the 7-day trial (anchored on or after the switch) are
 * looked at; companies that bought a plan or were granted one get nothing.
 * Sent to the company's active owners in their own language. Each send is
 * recorded in the audit log first-checked, so a re-run never sends twice.
 */
export async function sendTrialReminders(now: Date): Promise<{ sent: number; skipped: number }> {
  const since = new Date(Math.max(SEVEN_DAY_TRIAL_FROM.getTime(), now.getTime() - 10 * DAY_MS));
  const companies = await prisma.company.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      name: true,
      grantedPlan: true,
      grantedPlanUntil: true,
      subscription: { select: { status: true } },
    },
    // No cap: the window is ten days of sign-ups, and a capped, unordered
    // query would silently skip someone's reminder on the one day it is due.
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let skipped = 0;
  for (const company of companies) {
    const granted = company.grantedPlan && (!company.grantedPlanUntil || company.grantedPlanUntil > now);
    // Anyone who has bought (or was given) a plan is past the trial question.
    if (granted || company.subscription) continue;

    const anchor = await resolveTrialAnchor(company.id);
    if (!anchor || anchor < SEVEN_DAY_TRIAL_FROM) continue;
    const endsAt = trialEndsAt(anchor);
    const kind = trialReminderKind(endsAt, now);
    if (!kind || !endsAt) continue;

    const action = kind === 'soon' ? 'trial.reminder_soon' : 'trial.reminder_ended';
    const already = await prisma.auditLog.findFirst({ where: { companyId: company.id, action }, select: { id: true } });
    if (already) continue;

    const owners = await prisma.companyMember.findMany({
      where: { companyId: company.id, role: 'owner', user: { isActive: true } },
      select: { user: { select: { email: true, language: true } } },
    });
    if (owners.length === 0) {
      skipped += 1;
      continue;
    }

    // Recorded before sending: a crash after the send would otherwise repeat it.
    await prisma.auditLog.create({
      data: { actorEmail: 'system', action, entityType: 'company', entityId: company.id, companyId: company.id },
    });
    for (const owner of owners) {
      const locale: Locale = owner.user.language === 'tr' ? 'tr' : 'en';
      const result = await sendMail({
        to: owner.user.email,
        ...trialReminderEmail({
          locale,
          kind,
          companyName: company.name,
          endsAt,
          url: `${getBaseUrl().replace(/\/+$/, '')}/settings/billing`,
        }),
        idempotencyKey: `${action}-${company.id}-${owner.user.email}`,
      });
      if (result.ok) sent += 1;
      else skipped += 1;
    }
  }
  return { sent, skipped };
}

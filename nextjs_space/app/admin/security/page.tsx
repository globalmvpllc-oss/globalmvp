import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { getAdminEmail } from '@/lib/admin/access';
import { recordAudit } from '@/lib/admin/audit';
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from '@/lib/session-config';
import { LOGIN_RULE, SIGNUP_RULE } from '@/lib/rate-limit';

/**
 * Security posture.
 *
 * Shows whether protections are configured, never the values that configure
 * them. A page that prints a secret to prove it exists has defeated the secret.
 */
export const dynamic = 'force-dynamic';

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
      {note ? <span className="w-full text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}

/** Reports only presence, never content. */
const configured = (name: string) => (process.env[name] ? 'configured' : 'not configured');

export default async function AdminSecurityPage() {
  const check = await checkAdmin();
  if (!check.ok) return null;

  await recordAudit({ admin: check.admin, action: 'admin.security.viewed' });

  const recentAdminActivity = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, createdAt: true, actorEmail: true, action: true, ip: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-muted-foreground">Configuration status. No secret values are shown.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="mb-2 font-medium">Administrator</p>
          {/* The admin address is not a secret - it is an account name, and
              showing it is how an operator confirms the right one is in force. */}
          <Row label="ADMIN_EMAIL" value={getAdminEmail() ?? 'not configured'} />
          <Row label="Signed in as" value={check.admin.email} />
          <Row
            label="Authorisation"
            value="server-side"
            note="Resolved from the database row on every request; no client value participates."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="mb-2 font-medium">Secrets</p>
          <Row label="NEXTAUTH_SECRET" value={configured('NEXTAUTH_SECRET')} />
          <Row label="DATABASE_URL" value={configured('DATABASE_URL')} />
          <Row label="POLAR_ACCESS_TOKEN" value={configured('POLAR_ACCESS_TOKEN')} />
          <Row label="POLAR_WEBHOOK_SECRET" value={configured('POLAR_WEBHOOK_SECRET')} />
          <Row label="RESEND_API_KEY" value={configured('RESEND_API_KEY')} />
          <p className="pt-2 text-xs text-muted-foreground">
            Presence only. Values are never read into this page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="mb-2 font-medium">Session and rate limiting</p>
          <Row label="Session strategy" value="JWT" />
          <Row label="Session max age" value={`${SESSION_MAX_AGE / 86400} days`} />
          <Row label="Session refresh" value={`${SESSION_UPDATE_AGE / 86400} day`} />
          <Row label="Login limit" value={`${LOGIN_RULE.limit} / ${LOGIN_RULE.windowMs / 60000} min`} />
          <Row label="Signup limit" value={`${SIGNUP_RULE.limit} / ${SIGNUP_RULE.windowMs / 60000} min`} />
          <p className="pt-2 text-xs text-muted-foreground">
            Rate limiting is in-process: counters are per instance and reset on a cold start, so a
            distributed attempt is not fully covered. A shared store would close that gap.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="mb-3 font-medium">Recent administrative activity</p>
          <ul className="space-y-2 text-sm">
            {recentAdminActivity.map((entry: any) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{entry.action}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.actorEmail} · {entry.ip ?? 'no ip'} ·{' '}
                  {entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              </li>
            ))}
            {recentAdminActivity.length === 0 ? (
              <li className="text-muted-foreground">Nothing recorded yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

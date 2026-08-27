import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { isBillingConfigured } from '@/lib/billing/plans';

/**
 * System status, read-only.
 *
 * Deliberately offers no way to change an environment variable: an endpoint
 * that rewrites production configuration from a browser is a larger risk than
 * the convenience is worth.
 */
export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export default async function AdminSettingsPage() {
  const check = await checkAdmin();
  if (!check.ok) return null;

  await recordAudit({ admin: check.admin, action: 'admin.settings.viewed' });

  // A trivial query is the only honest way to report the database as reachable.
  let databaseStatus = 'unreachable';
  try {
    await prisma.user.count();
    databaseStatus = 'connected';
  } catch {
    databaseStatus = 'unreachable';
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Read-only status. Configuration is changed through the environment, not from here.
        </p>
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="mb-2 font-medium">System</p>
          <Row label="Environment" value={process.env.NODE_ENV ?? 'unknown'} />
          <Row label="Database" value={databaseStatus} />
          <Row label="Authentication" value={process.env.NEXTAUTH_SECRET ? 'configured' : 'not configured'} />
          <Row label="Billing (Polar)" value={isBillingConfigured() ? 'configured' : 'not configured'} />
          <Row label="Polar environment" value={process.env.POLAR_SERVER ?? 'sandbox (default)'} />
          <Row label="PDF service" value={process.env.ABACUSAI_API_KEY ? 'configured' : 'not configured'} />
          <Row label="Email (Resend)" value={process.env.RESEND_API_KEY ? 'configured' : 'not configured'} />
          <Row label="Admin account" value={check.admin.email} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        No secret value appears on this page, and there is no control here that writes to the
        environment.
      </p>
    </div>
  );
}

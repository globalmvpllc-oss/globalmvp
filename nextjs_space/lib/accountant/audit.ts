import 'server-only';
import { prisma } from '@/lib/db';
import { redactMetadata, truncateHeader, clientIp, type AuditAction } from '@/lib/admin/audit-rules';
import { isAccountant } from './rules';

/**
 * Writes an accountant event to the audit log, scoped to the company, so the
 * owner sees it under Settings → Mali müşavir. Never throws: an audit write
 * that fails must not break the download or the sign-in it records.
 */
export async function recordAccountantEvent(options: {
  actor: { id: string; email?: string | null };
  action: Extract<AuditAction, `accountant.${string}`>;
  companyId: string;
  request?: Request;
  metadata?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actor.id,
        actorEmail: options.actor.email ?? '',
        action: options.action,
        entityType: 'company',
        entityId: options.companyId,
        companyId: options.companyId,
        metadata: (redactMetadata(options.metadata ?? null) ?? undefined) as any,
        ip: clientIp(options.request?.headers.get('x-forwarded-for')),
        userAgent: truncateHeader(options.request?.headers.get('user-agent')),
      },
    });
  } catch (error) {
    console.error('[accountant:audit] could not record', options.action);
  }
}

/** Records a download only when the member is an accountant. */
export async function recordAccountantDownload(
  auth: { user: { id: string; email?: string | null }; companyId: string; role: string },
  request: Request,
  what: Record<string, unknown>
): Promise<void> {
  if (!isAccountant(auth.role)) return;
  await recordAccountantEvent({ actor: auth.user, action: 'accountant.download', companyId: auth.companyId, request, metadata: what });
}

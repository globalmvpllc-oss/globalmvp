import { prisma } from '@/lib/db';
import {
  redactMetadata,
  truncateHeader,
  clientIp,
  type AuditAction,
} from './audit-rules';
import type { AdminUser } from './auth';

/**
 * Writing to the audit trail.
 *
 * Recording is best-effort by design: a failure here must not turn a successful
 * administrative read into an error the operator sees. The failure is logged so
 * a silent gap in the trail is still visible in the server logs.
 */
export async function recordAudit(options: {
  admin: AdminUser;
  action: AuditAction;
  request?: Request;
  entityType?: string;
  entityId?: string;
  companyId?: string;
  metadata?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.admin.id,
        // Denormalised so the entry still reads if the account is removed.
        actorEmail: options.admin.email,
        action: options.action,
        entityType: options.entityType ?? null,
        entityId: options.entityId ?? null,
        companyId: options.companyId ?? null,
        // Everything is redacted before it reaches the column.
        metadata: (redactMetadata(options.metadata ?? null) ?? undefined) as any,
        ip: clientIp(options.request?.headers.get('x-forwarded-for')),
        userAgent: truncateHeader(options.request?.headers.get('user-agent')),
      },
    });
  } catch (error) {
    console.error('[audit] could not record entry', {
      action: options.action,
      code: (error as { code?: string })?.code,
    });
  }
}

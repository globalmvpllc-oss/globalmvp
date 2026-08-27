-- AuditLog table.
--
-- Purely additive: no existing table, column or row is created, altered,
-- dropped or rewritten, so this cannot lose or change data. Rolling back is
-- dropping the table.
--
-- No foreign keys on purpose. An audit entry must outlive the user or company
-- it describes; a cascade would delete the record of the deletion.

CREATE TABLE "AuditLog" (
    "id"          TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "actorUserId" TEXT,
    "actorEmail"  TEXT         NOT NULL,

    "action"      TEXT         NOT NULL,
    "entityType"  TEXT,
    "entityId"    TEXT,
    "companyId"   TEXT,

    "metadata"    JSONB,

    "ip"          TEXT,
    "userAgent"   TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Newest-first listing, the default view.
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
-- Filtering by what happened.
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
-- "everything this administrator did".
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
-- "everything that touched this company".
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");
-- "the history of this one record".
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- Aşama 3 — mali müşavir erişimi (accountant access)
--
-- Purely additive: one new table for invitations. Nothing existing is altered.
-- The accountant itself is a CompanyMember row with role 'accountant' (the
-- role column already exists), so no other table changes.
--
-- Generated with
--   npx prisma migrate diff --from-schema-datamodel <previous schema> --to-schema-datamodel prisma/schema.prisma --script
-- and copied verbatim.

-- CreateTable
CREATE TABLE "AccountantInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountantInvite_tokenHash_key" ON "AccountantInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountantInvite_companyId_idx" ON "AccountantInvite"("companyId");

-- CreateIndex
CREATE INDEX "AccountantInvite_email_idx" ON "AccountantInvite"("email");

-- AddForeignKey
ALTER TABLE "AccountantInvite" ADD CONSTRAINT "AccountantInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rollback (only if this migration must be undone; drops the invitations):
--   DROP TABLE "AccountantInvite";
-- Accountant memberships created through invitations would remain as
-- CompanyMember rows with role 'accountant'; remove them with
--   DELETE FROM "CompanyMember" WHERE "role" = 'accountant';

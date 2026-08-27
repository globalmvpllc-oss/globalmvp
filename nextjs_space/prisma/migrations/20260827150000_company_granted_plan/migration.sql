-- Adds the admin-granted plan fields to Company.
--
-- Purely additive: three nullable columns, no ALTER of an existing column and no
-- data change. A null grantedPlan means "no grant", which is every existing row,
-- so nothing is backfilled and no behaviour changes until an admin sets one.
--
-- These are deliberately separate from the Subscription table, which the Polar
-- webhook owns and would overwrite. Plan resolution (Polar wins over grant, grant
-- wins over Free) lives in lib/billing/limits.ts.

ALTER TABLE "Company" ADD COLUMN "grantedPlan"       TEXT;
ALTER TABLE "Company" ADD COLUMN "grantedPlanUntil"  TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "grantedPlanReason" TEXT;

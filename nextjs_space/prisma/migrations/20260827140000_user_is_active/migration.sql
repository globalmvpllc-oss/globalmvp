-- Adds User.isActive.
--
-- Purely additive with a default, so every existing row becomes active without
-- a backfill and no NULL is ever possible. Deactivating an account refuses it at
-- login and revokes its API access (see lib/auth.ts and lib/auth-helpers.ts),
-- while the row is kept so the account's history and audit trail survive.

ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

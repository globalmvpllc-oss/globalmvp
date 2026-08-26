-- Subscription table.
--
-- Purely additive. No existing table, column or row is created, altered,
-- dropped or rewritten, so this cannot lose or change data and rolling back is
-- simply dropping the table again.
--
-- Nothing is backfilled on purpose: a company with no row is on the Free plan.
-- Seeding a row per company would invent subscriptions that do not exist in
-- Polar, and would create a write path the webhook does not own.

CREATE TABLE "Subscription" (
    "id"                  TEXT            NOT NULL,
    "companyId"           TEXT            NOT NULL,

    "polarSubscriptionId" TEXT            NOT NULL,
    "polarCustomerId"     TEXT            NOT NULL,
    "polarProductId"      TEXT            NOT NULL,
    "polarPriceId"        TEXT            NOT NULL,

    "plan"                TEXT            NOT NULL,
    "status"              TEXT            NOT NULL,
    "interval"            TEXT            NOT NULL,

    "currency"            TEXT            NOT NULL,
    -- Same precision as every other money column in this schema.
    "amount"              DECIMAL(15,2)   NOT NULL,

    "currentPeriodStart"  TIMESTAMP(3)    NOT NULL,
    "currentPeriodEnd"    TIMESTAMP(3)    NOT NULL,

    "cancelAtPeriodEnd"   BOOLEAN         NOT NULL DEFAULT false,
    "canceledAt"          TIMESTAMP(3),
    "trialEndsAt"         TIMESTAMP(3),
    "lastEventAt"         TIMESTAMP(3),

    "createdAt"           TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- One subscription per company: the row is the company's plan, not a history.
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- The idempotency anchor. A redelivered Polar webhook upserts this same row
-- rather than inserting a duplicate.
CREATE UNIQUE INDEX "Subscription_polarSubscriptionId_key"
    ON "Subscription"("polarSubscriptionId");

-- Supports "which subscriptions are past_due" style reads.
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- Supports expiry sweeps and renewal-date queries.
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- Deleting a company removes its subscription row. The subscription in Polar is
-- a separate lifecycle and is cancelled there, not by this constraint.
ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

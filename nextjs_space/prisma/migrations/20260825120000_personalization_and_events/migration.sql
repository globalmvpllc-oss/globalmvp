-- Personalization settings and the calendar Event table.
--
-- Additive only. No table is dropped, no column is removed or retyped, and no
-- existing row is rewritten except for the invoiceNextNumber backfill at the
-- end, which only fills a column added by this same migration.
--
-- Rollback is the mirror image: drop the Event table and drop the added
-- columns. Nothing here is destructive, so a failed deploy can be reverted
-- without data loss.

-- ---------------------------------------------------------------------------
-- Company: branding, invoice settings, payment settings
-- ---------------------------------------------------------------------------
ALTER TABLE "Company"
  ADD COLUMN "primaryColor"             TEXT,
  ADD COLUMN "secondaryColor"           TEXT,
  ADD COLUMN "accentColor"              TEXT,
  ADD COLUMN "industry"                 TEXT,
  ADD COLUMN "invoicePrefix"            TEXT           NOT NULL DEFAULT 'INV-',
  ADD COLUMN "invoiceNextNumber"        INTEGER        NOT NULL DEFAULT 1,
  ADD COLUMN "defaultPaymentTerms"      INTEGER        NOT NULL DEFAULT 30,
  ADD COLUMN "defaultTaxRate"           DECIMAL(7,4)   NOT NULL DEFAULT 0,
  ADD COLUMN "invoiceNotes"             TEXT,
  ADD COLUMN "paymentInstructions"      TEXT,
  ADD COLUMN "invoiceFooter"            TEXT,
  ADD COLUMN "invoiceShowLogo"          BOOLEAN        NOT NULL DEFAULT true,
  ADD COLUMN "invoiceShowTax"           BOOLEAN        NOT NULL DEFAULT true,
  ADD COLUMN "invoiceTemplate"          TEXT           NOT NULL DEFAULT 'classic',
  ADD COLUMN "defaultPaymentMethod"     TEXT,
  ADD COLUMN "bankTransferInstructions" TEXT;

-- ---------------------------------------------------------------------------
-- User: personal preferences that follow the person across companies
-- ---------------------------------------------------------------------------
ALTER TABLE "User"
  ADD COLUMN "theme"            TEXT    NOT NULL DEFAULT 'system',
  ADD COLUMN "language"         TEXT    NOT NULL DEFAULT 'en',
  ADD COLUMN "dateFormat"       TEXT,
  ADD COLUMN "numberFormat"     TEXT,
  ADD COLUMN "firstDayOfWeek"   INTEGER,
  ADD COLUMN "sidebarCollapsed" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- CompanyMember: preferences that only mean something inside one company
-- ---------------------------------------------------------------------------
ALTER TABLE "CompanyMember"
  ADD COLUMN "dashboardPreferences"    JSONB,
  ADD COLUMN "notificationPreferences" JSONB;

-- ---------------------------------------------------------------------------
-- Event
-- ---------------------------------------------------------------------------
CREATE TABLE "Event" (
  "id"          TEXT         NOT NULL,
  "companyId"   TEXT         NOT NULL,
  "createdById" TEXT,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "startAt"     TIMESTAMP(3) NOT NULL,
  "endAt"       TIMESTAMP(3),
  "allDay"      BOOLEAN      NOT NULL DEFAULT false,
  "type"        TEXT         NOT NULL DEFAULT 'OTHER',
  "status"      TEXT,
  "source"      TEXT         NOT NULL DEFAULT 'MANUAL',
  "customerId"  TEXT,
  "invoiceId"   TEXT,
  "amount"      DECIMAL(15,2),
  "currency"    TEXT,
  "reminderAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- Deleting a company removes its calendar, matching every other company-owned
-- table. The other three links null out instead: losing a user, a customer or
-- an invoice should not delete a meeting someone scheduled about it.
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Event_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Event_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Event_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The calendar's hot path: one company's events within a date window.
CREATE INDEX "Event_companyId_startAt_idx" ON "Event"("companyId", "startAt");
-- Filtering a month view by event type.
CREATE INDEX "Event_companyId_type_idx"    ON "Event"("companyId", "type");
-- "What is scheduled about this invoice / this customer?"
CREATE INDEX "Event_invoiceId_idx"         ON "Event"("invoiceId");
CREATE INDEX "Event_customerId_idx"        ON "Event"("customerId");

-- ---------------------------------------------------------------------------
-- Backfill: invoiceNextNumber
-- ---------------------------------------------------------------------------
-- Leaving every company at 1 would make the next generated number collide with
-- an existing invoice, so it is derived from the numbers already issued.
--
-- Only plain sequential numbers are considered. The old generator fell back to
-- "INV-<timestamp>" after repeated collisions, and letting an 8-digit timestamp
-- set the sequence would jump every company to a nonsensical counter. The
-- pattern below therefore matches an optional non-digit prefix followed by at
-- most six digits.
--
-- Existing invoice numbers are read, never modified.
UPDATE "Company" c
SET "invoiceNextNumber" = COALESCE(
  (
    SELECT MAX((regexp_replace(i."invoiceNumber", '^[^0-9]*', ''))::bigint)
    FROM "Invoice" i
    WHERE i."companyId" = c."id"
      AND i."invoiceNumber" ~ '^[^0-9]*[0-9]{1,6}$'
  ),
  0
) + 1;

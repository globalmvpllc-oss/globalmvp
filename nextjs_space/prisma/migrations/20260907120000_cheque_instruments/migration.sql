-- Cheques and promissory notes — çek ve senet
--
-- Purely additive: one new table and its indexes. No existing table, column,
-- index or constraint is altered or dropped, and no existing row is written to.
-- Every foreign key added here lives on the NEW table and points at existing
-- ones, so Company, Customer, Vendor, Invoice, ExpenseTransaction and Payment
-- are untouched on disk — the `chequeInstruments` fields those models gain in
-- schema.prisma are Prisma-side back-relations with no column behind them.
--
-- The DDL below was generated with
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma --script
-- and copied verbatim, so it cannot drift from the model.
--
-- Rollback is at the bottom of this file.

-- --------------------------------------------------------------------------
-- ChequeInstrument
-- --------------------------------------------------------------------------
-- `direction`, `instrument` and `status` are TEXT rather than enums, matching
-- Invoice.status and the transaction statuses: the lifecycle lives in
-- lib/cheque-status.ts, where a transition table can be read and tested, and
-- adding a state later needs no migration.
--
-- `paymentId` is the one link that means money. It is null until the instrument
-- clears, which is the whole point of the model: a cheque in the drawer is a
-- promise, and no figure in the product may count it as cash.
CREATE TABLE "ChequeInstrument" (
    "id"           TEXT           NOT NULL,
    "companyId"    TEXT           NOT NULL,
    "direction"    TEXT           NOT NULL,
    "instrument"   TEXT           NOT NULL DEFAULT 'CHEQUE',
    "amount"       DECIMAL(15,2)  NOT NULL,
    "currency"     TEXT           NOT NULL DEFAULT 'USD',
    "issueDate"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate"      TIMESTAMP(3)   NOT NULL,
    "bankName"     TEXT,
    "chequeNumber" TEXT,
    "drawerName"   TEXT,
    "status"       TEXT           NOT NULL DEFAULT 'PORTFOLIO',
    "presentedAt"  TIMESTAMP(3),
    "settledAt"    TIMESTAMP(3),
    "notes"        TEXT,
    "customerId"   TEXT,
    "vendorId"     TEXT,
    "invoiceId"    TEXT,
    "expenseId"    TEXT,
    "paymentId"    TEXT,
    "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "ChequeInstrument_pkey" PRIMARY KEY ("id")
);

-- "this company's instruments" — the tenant scope every query carries.
CREATE INDEX "ChequeInstrument_companyId_idx" ON "ChequeInstrument"("companyId");

-- The list and the portfolio totals: one company's instruments in due-date
-- order. Every screen sorts by vade, because the question is always "what is
-- coming up".
CREATE INDEX "ChequeInstrument_companyId_dueDate_idx" ON "ChequeInstrument"("companyId", "dueDate");

-- The portfolio and bounced filters.
CREATE INDEX "ChequeInstrument_companyId_status_idx" ON "ChequeInstrument"("companyId", "status");

-- The calendar's month window, which draws received and issued separately.
CREATE INDEX "ChequeInstrument_companyId_direction_dueDate_idx" ON "ChequeInstrument"("companyId", "direction", "dueDate");

-- "what has this customer given us", and the equivalents. Also what makes the
-- SetNull cascades below cheap.
CREATE INDEX "ChequeInstrument_customerId_idx" ON "ChequeInstrument"("customerId");
CREATE INDEX "ChequeInstrument_vendorId_idx" ON "ChequeInstrument"("vendorId");
CREATE INDEX "ChequeInstrument_invoiceId_idx" ON "ChequeInstrument"("invoiceId");
CREATE INDEX "ChequeInstrument_expenseId_idx" ON "ChequeInstrument"("expenseId");

-- Company cascades, as it does for every model: a deleted company takes its
-- records with it.
ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Everything else is SetNull, following Event. An instrument is financial
-- evidence — a cheque somebody handed over, with a bank, a number and a due
-- date — and deleting the customer record it was linked to must not erase the
-- fact that it exists. The row survives with a null link and its own
-- `drawerName` still readable, which is what a business chasing a bounced
-- cheque actually needs.
ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "ExpenseTransaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SetNull here too, and for a sharper reason: deleting the filing record of a
-- cheque must never delete the money it produced. The Payment survives with its
-- link cleared, so the invoice it settled stays settled.
ALTER TABLE "ChequeInstrument"
    ADD CONSTRAINT "ChequeInstrument_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Rollback
-- --------------------------------------------------------------------------
--   DROP TABLE "ChequeInstrument";
--
-- Nothing else has to be undone: no pre-existing object was modified, so
-- dropping this one table restores the database exactly as it was. Invoices,
-- payments, customers, vendors and expenses are unaffected either way, and any
-- Payment an instrument produced is a real payment that stays.

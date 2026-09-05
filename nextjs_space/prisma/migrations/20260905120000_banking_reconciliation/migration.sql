-- Banking & Reconciliation V1.1
--
-- Purely additive: two new tables. No existing table, column, index or
-- constraint is altered or dropped, and no existing row is written to. The
-- foreign keys added here live on the NEW table and point at existing ones, so
-- Invoice, Payment, IncomeTransaction and ExpenseTransaction are untouched on
-- disk — the `bankTransactions` fields added to those models in schema.prisma
-- are Prisma-side back-relations only.
--
-- Rollback is at the bottom of this file.

-- --------------------------------------------------------------------------
-- BankAccount
-- --------------------------------------------------------------------------
CREATE TABLE "BankAccount" (
    "id"                TEXT           NOT NULL,
    "companyId"         TEXT           NOT NULL,
    "bankName"          TEXT           NOT NULL,
    "accountName"       TEXT           NOT NULL,
    "accountNumber"     TEXT,
    "iban"              TEXT,
    "currency"          TEXT           NOT NULL DEFAULT 'USD',
    "provider"          TEXT           NOT NULL DEFAULT 'manual',
    "providerAccountId" TEXT,
    "lastBalance"       DECIMAL(15,2),
    "lastBalanceAt"     TIMESTAMP(3),
    "lastSyncedAt"      TIMESTAMP(3),
    "isActive"          BOOLEAN        NOT NULL DEFAULT true,
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- "this company's accounts" — every list and picker.
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- Re-connecting a provider account must update the existing row rather than
-- create a second one. NULLs are distinct in PostgreSQL, so this does not
-- restrict manual accounts (providerAccountId IS NULL) in any way: a company
-- may hold as many of those as it likes.
CREATE UNIQUE INDEX "BankAccount_companyId_provider_providerAccountId_key"
    ON "BankAccount"("companyId", "provider", "providerAccountId");

ALTER TABLE "BankAccount"
    ADD CONSTRAINT "BankAccount_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- BankTransaction
-- --------------------------------------------------------------------------
CREATE TABLE "BankTransaction" (
    "id"               TEXT           NOT NULL,
    "companyId"        TEXT           NOT NULL,
    "bankAccountId"    TEXT           NOT NULL,
    "date"             TIMESTAMP(3)   NOT NULL,
    "description"      TEXT           NOT NULL,
    "amount"           DECIMAL(15,2)  NOT NULL,
    "currency"         TEXT           NOT NULL DEFAULT 'USD',
    "direction"        TEXT           NOT NULL,
    "balance"          DECIMAL(15,2),
    "reference"        TEXT,
    "externalId"       TEXT,
    "status"           TEXT           NOT NULL DEFAULT 'UNMATCHED',
    "matchedInvoiceId" TEXT,
    "matchedPaymentId" TEXT,
    "matchedIncomeId"  TEXT,
    "matchedExpenseId" TEXT,
    "matchedAt"        TIMESTAMP(3),
    "matchConfidence"  INTEGER,
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- Re-importing the same statement must be a no-op rather than a duplicate.
-- NULL externalIds stay distinct, so hand-entered lines are never blocked.
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_externalId_key"
    ON "BankTransaction"("bankAccountId", "externalId");

CREATE INDEX "BankTransaction_companyId_idx"            ON "BankTransaction"("companyId");
CREATE INDEX "BankTransaction_companyId_date_idx"       ON "BankTransaction"("companyId", "date");
CREATE INDEX "BankTransaction_bankAccountId_date_idx"   ON "BankTransaction"("bankAccountId", "date");
CREATE INDEX "BankTransaction_companyId_status_idx"     ON "BankTransaction"("companyId", "status");

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a financial record clears the link instead of deleting the bank
-- line: the statement line is a fact from the bank and survives whatever it was
-- reconciled against. lib/banking/reconciliation.ts reads such a row back as
-- unreconciled, so it reappears for matching rather than claiming a phantom.
ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedInvoiceId_fkey"
    FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedPaymentId_fkey"
    FOREIGN KEY ("matchedPaymentId") REFERENCES "Payment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedIncomeId_fkey"
    FOREIGN KEY ("matchedIncomeId") REFERENCES "IncomeTransaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedExpenseId_fkey"
    FOREIGN KEY ("matchedExpenseId") REFERENCES "ExpenseTransaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Rollback
-- --------------------------------------------------------------------------
--   DROP TABLE "BankTransaction";
--   DROP TABLE "BankAccount";
--
-- Nothing else has to be undone: no pre-existing object was modified, so
-- dropping these two tables restores the database exactly as it was.

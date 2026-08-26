-- Composite indexes for the company-scoped, date-ordered queries.
--
-- Index-only. No table, column or row is created, altered, dropped or
-- rewritten, so this cannot lose or change data and rolling back is simply
-- dropping the four indexes again.
--
-- Why these four, and not more: each one matches a query the application
-- actually runs. Every list is filtered by companyId first and then either
-- ordered by a date or windowed to a month, and a single-column index on the
-- date alone cannot serve that — Postgres would have to scan rows belonging to
-- other companies to find the ones in range. The existing single-column
-- indexes are left in place; they still serve lookups that do not carry a
-- company filter.
--
-- CREATE INDEX (not CONCURRENTLY) is used deliberately: Prisma runs migrations
-- inside a transaction, and CONCURRENTLY cannot run in one. These tables are
-- small at present, so the brief write lock is not a concern. If they grow
-- large before this ships, build the indexes CONCURRENTLY by hand first — the
-- IF NOT EXISTS guards below then make this migration a no-op.

-- Invoice: the calendar asks for one company's invoices inside a due-date
-- window (app/api/invoices/route.ts, `from`/`to`).
CREATE INDEX IF NOT EXISTS "Invoice_companyId_dueDate_idx"
  ON "Invoice" ("companyId", "dueDate");

-- Payment: serves both the payments list, which orders by paymentDate desc
-- within a company, and the calendar's month window
-- (app/api/payments/route.ts).
CREATE INDEX IF NOT EXISTS "Payment_companyId_paymentDate_idx"
  ON "Payment" ("companyId", "paymentDate");

-- ExpenseTransaction: the list orders by date desc within a company; the
-- calendar windows unpaid expenses by dueDate (app/api/expenses/route.ts).
CREATE INDEX IF NOT EXISTS "ExpenseTransaction_companyId_date_idx"
  ON "ExpenseTransaction" ("companyId", "date");

CREATE INDEX IF NOT EXISTS "ExpenseTransaction_companyId_dueDate_idx"
  ON "ExpenseTransaction" ("companyId", "dueDate");

-- IncomeTransaction: the list orders by date desc within a company
-- (app/api/income/route.ts). No dueDate index — the calendar derives no
-- entries from income, so there is no query to serve.
CREATE INDEX IF NOT EXISTS "IncomeTransaction_companyId_date_idx"
  ON "IncomeTransaction" ("companyId", "date");

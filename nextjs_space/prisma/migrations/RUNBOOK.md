# TASK B — MIGRATION RUNBOOK

These steps must run on a machine that can reach both the Prisma engine
downloads and the database. They could not be run here: `binaries.prisma.sh`
and the Supabase host both return 403 from this sandbox, and no database
credentials are present.

**Nothing in this runbook has been executed. The production database has not
been touched.**

---

## Before you start

```powershell
cd C:\Projelerim\global-mvp\nextjs_space
git status                 # working tree should be clean apart from this change
npx prisma validate        # must pass before anything else
```

If `prisma validate` fails, stop and send me the output. Everything below
assumes the schema parses.

---

## Step 1 — Take a database snapshot

Supabase Dashboard → Database → Backups. Confirm a recent backup exists, or
create one. This is the real rollback path; everything after this is reversible
but a snapshot costs nothing.

---

## Step 2 — Verify the schema matches the live database

The schema has never been reconciled against the database, because it was
applied with `db push` rather than migrations. Check for drift **before**
baselining, since baselining records the schema as already applied:

```powershell
npx prisma migrate diff `
  --from-url $env:DIRECT_URL `
  --to-schema-datamodel prisma\schema.prisma `
  --script > drift.sql
```

Open `drift.sql`.

- **Expected:** only the additions from this task — the new `Company`, `User`
  and `CompanyMember` columns, and `CREATE TABLE "Event"`.
- **If anything else appears** — a column being dropped, a type change, a table
  you do not recognise — **stop**. That is real drift between the schema file
  and the database, and it must be resolved before a baseline is meaningful.
  Send me `drift.sql`.

Delete `drift.sql` afterwards; it is a diagnostic, not part of the repository.

---

## Step 3 — Create the baseline

The baseline records the schema *as it stood before this task*, so it must be
generated from a schema without the new fields:

```powershell
# Generate the baseline from the pre-Task-B schema
git stash push prisma\schema.prisma

mkdir prisma\migrations\0_init
npx prisma migrate diff `
  --from-empty `
  --to-schema-datamodel prisma\schema.prisma `
  --script > prisma\migrations\0_init\migration.sql

git stash pop
```

Inspect `prisma\migrations\0_init\migration.sql`. It should contain
`CREATE TABLE` statements for the 15 pre-existing models and nothing else — no
`DROP`, no `ALTER`, and no `Event` table.

Mark it as already applied, so Prisma does not try to recreate tables that
exist:

```powershell
npx prisma migrate resolve --applied 0_init
```

---

## Step 4 — Check the state

```powershell
npx prisma migrate status
```

Expected: `0_init` applied, and
`20260825120000_personalization_and_events` pending.

If it reports the database schema is not empty and no migrations are found,
Step 3 did not take effect — do not continue.

---

## Step 5 — Rehearse on a disposable database

Do not let production be the first place this migration runs. Create a throwaway
Supabase project (or a local Postgres), point `DIRECT_URL` at it, and:

```powershell
npx prisma migrate deploy
```

Both migrations should apply cleanly to an empty database. This proves the
baseline and the feature migration are consistent with each other.

---

## Step 6 — Apply to production

```powershell
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` applies only pending migrations and never resets anything.

Then verify the backfill did what it should:

```sql
SELECT c."name", c."invoicePrefix", c."invoiceNextNumber",
       (SELECT COUNT(*) FROM "Invoice" i WHERE i."companyId" = c."id") AS invoices,
       (SELECT MAX(i."invoiceNumber") FROM "Invoice" i WHERE i."companyId" = c."id") AS highest
FROM "Company" c;
```

`invoiceNextNumber` should be one above the highest sequential number already
issued. A company with no invoices should read 1.

---

## Step 7 — Regression

```powershell
npm test          # 104/104
npx tsc --noEmit  # 0 errors
npm run build
```

Then in the running application: sign in, open the dashboard, open an invoice,
record a payment. None of this task changes application behaviour, so anything
that breaks points at the migration rather than at the code.

---

## Rollback

**Feature migration.** Purely additive, so reversing it is mechanical:

```sql
DROP TABLE "Event";

ALTER TABLE "Company"
  DROP COLUMN "primaryColor", DROP COLUMN "secondaryColor",
  DROP COLUMN "accentColor", DROP COLUMN "industry",
  DROP COLUMN "invoicePrefix", DROP COLUMN "invoiceNextNumber",
  DROP COLUMN "defaultPaymentTerms", DROP COLUMN "defaultTaxRate",
  DROP COLUMN "invoiceNotes", DROP COLUMN "paymentInstructions",
  DROP COLUMN "invoiceFooter", DROP COLUMN "invoiceShowLogo",
  DROP COLUMN "invoiceShowTax", DROP COLUMN "invoiceTemplate",
  DROP COLUMN "defaultPaymentMethod", DROP COLUMN "bankTransferInstructions";

ALTER TABLE "User"
  DROP COLUMN "theme", DROP COLUMN "language", DROP COLUMN "dateFormat",
  DROP COLUMN "numberFormat", DROP COLUMN "firstDayOfWeek",
  DROP COLUMN "sidebarCollapsed";

ALTER TABLE "CompanyMember"
  DROP COLUMN "dashboardPreferences", DROP COLUMN "notificationPreferences";
```

No pre-existing row is modified by this migration, so rolling back loses only
data written into the new columns after deployment. Existing invoices,
customers, payments and company records are untouched throughout.

**Baseline.** Nothing to roll back — `migrate resolve --applied` only writes a
row to `_prisma_migrations`. If it needs undoing, delete that row.

---

## What this task deliberately did not do

No UI, no API, no calendar logic, no settings screens. The new columns are
unread by any code path, which is why the existing 104 tests pass unchanged:
adding a column that nothing selects cannot alter behaviour.

---

# BANKING & RECONCILIATION V1.1 — `20260905120000_banking_reconciliation`

**Not executed here.** No database credentials are present in this environment,
so nothing below has been run and the production database has not been touched.

## What it does

Creates two tables — `BankAccount` and `BankTransaction` — and nothing else.

It is purely additive. No existing table, column, index or constraint is
altered or dropped, and no existing row is written to. The four
`matched*Id` foreign keys live on the new `BankTransaction` table and point at
`Invoice`, `Payment`, `IncomeTransaction` and `ExpenseTransaction`; those four
tables gain a `bankTransactions` field in `schema.prisma`, but that is a
Prisma-side back-relation with no column behind it. This was verified with:

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma --script
```

The generated DDL for the two new tables matches this migration column for
column, index for index and constraint for constraint, and no other table's
DDL changes.

## Apply

```powershell
cd C:\Projelerim\global-mvp\nextjs_space
npx prisma validate       # must pass first
npx prisma migrate deploy # applies only pending migrations; never resets
npx prisma generate
```

## Verify

```sql
SELECT COUNT(*) FROM "BankAccount";      -- 0 on first deploy
SELECT COUNT(*) FROM "BankTransaction";  -- 0 on first deploy
```

Then in the application: open **Banking**, add an account, paste a small CSV
into **Reconcile → Import**, and import it twice. The second import must report
every row as "already present" and add nothing — that is the idempotency
guarantee from `@@unique([bankAccountId, externalId])`.

## Rollback

```sql
DROP TABLE "BankTransaction";
DROP TABLE "BankAccount";
```

Nothing else has to be undone, because nothing pre-existing was modified.
Dropping these two tables restores the database exactly as it was; invoices,
payments, income and expenses are unaffected either way.

## Behaviour before the migration runs

The banking screens and the eight `/api/bank-*` routes will fail against a
database without these tables. Everything else is unchanged: no existing route,
page or query reads the new models, and the banking card on the dashboard
renders nothing when its own request does not succeed.

-- Avc KolayStok: at most 20 instant low-stock alerts per company per day
-- (Turkey day). Additive only: one new table, nothing else changes.
CREATE TABLE "StockAlertDay" (
    "companyId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StockAlertDay_pkey" PRIMARY KEY ("companyId", "day"),
    CONSTRAINT "StockAlertDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Rollback: DROP TABLE "StockAlertDay";

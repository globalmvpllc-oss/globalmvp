-- Avc KolayStok (stok bölümü)
--
-- Purely additive: two new columns with defaults (Company.usageMode,
-- Vendor.orderEmails) and new Stock* tables. Nothing existing is altered or
-- dropped; every existing row stays valid. Generated with prisma migrate diff.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "usageMode" TEXT NOT NULL DEFAULT 'finance';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "orderEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "StockSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "alertEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senderEmail" TEXT,
    "senderDomainId" TEXT,
    "senderVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockStaff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "failedPins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "size" TEXT,
    "material" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'adet',
    "purchasePrice" DECIMAL(15,2),
    "salePrice" DECIMAL(15,2),
    "quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(15,3) NOT NULL DEFAULT 50,
    "targetStock" DECIMAL(15,3),
    "shelf" TEXT,
    "photoKey" TEXT,
    "vendorId" TEXT,
    "notes" TEXT,
    "lowAlertAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" DECIMAL(15,3) NOT NULL,
    "quantityAfter" DECIMAL(15,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "actorStaffId" TEXT,
    "actorName" TEXT NOT NULL,
    "countId" TEXT,
    "resetId" TEXT,
    "undoOfId" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "position" INTEGER NOT NULL DEFAULT 0,
    "startedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "counted" DECIMAL(15,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "backupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "StockReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTelegramChat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTelegramChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTelegramCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTelegramCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBackup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "s3Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockSettings_companyId_key" ON "StockSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockSettings_staffCode_key" ON "StockSettings"("staffCode");

-- CreateIndex
CREATE INDEX "StockStaff_companyId_idx" ON "StockStaff"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCategory_companyId_name_key" ON "StockCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "StockProduct_companyId_searchKey_idx" ON "StockProduct"("companyId", "searchKey");

-- CreateIndex
CREATE INDEX "StockProduct_companyId_categoryId_idx" ON "StockProduct"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "StockProduct_companyId_code_key" ON "StockProduct"("companyId", "code");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_createdAt_idx" ON "StockMovement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockCount_companyId_status_idx" ON "StockCount"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_productId_key" ON "StockCountLine"("countId", "productId");

-- CreateIndex
CREATE INDEX "StockReset_companyId_createdAt_idx" ON "StockReset"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTelegramChat_companyId_chatId_key" ON "StockTelegramChat"("companyId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTelegramCode_codeHash_key" ON "StockTelegramCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "StockBackup_companyId_day_key" ON "StockBackup"("companyId", "day");

-- AddForeignKey
ALTER TABLE "StockSettings" ADD CONSTRAINT "StockSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockStaff" ADD CONSTRAINT "StockStaff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCategory" ADD CONSTRAINT "StockCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCategory" ADD CONSTRAINT "StockCategory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockProduct" ADD CONSTRAINT "StockProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockProduct" ADD CONSTRAINT "StockProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockProduct" ADD CONSTRAINT "StockProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StockProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StockProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReset" ADD CONSTRAINT "StockReset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTelegramChat" ADD CONSTRAINT "StockTelegramChat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTelegramCode" ADD CONSTRAINT "StockTelegramCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBackup" ADD CONSTRAINT "StockBackup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rollback (drops all KolayStok data):
--   DROP TABLE "StockBackup", "StockTelegramCode", "StockTelegramChat", "StockReset",
--     "StockCountLine", "StockCount", "StockMovement", "StockProduct", "StockCategory",
--     "StockStaff", "StockSettings";
--   ALTER TABLE "Vendor" DROP COLUMN "orderEmails";
--   ALTER TABLE "Company" DROP COLUMN "usageMode";

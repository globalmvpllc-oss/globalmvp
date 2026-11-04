-- Avc KolayStok — reasons for a one-tap "+" / "−" (Ayarlar'dan değiştirilebilir).
-- Purely additive: two columns with defaults; existing rows get the defaults.

-- AlterTable
ALTER TABLE "StockSettings" ADD COLUMN     "quickMinusReason" TEXT NOT NULL DEFAULT 'sale',
ADD COLUMN     "quickPlusReason" TEXT NOT NULL DEFAULT 'receipt';

-- Rollback:
--   ALTER TABLE "StockSettings" DROP COLUMN "quickPlusReason", DROP COLUMN "quickMinusReason";

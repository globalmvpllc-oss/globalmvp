-- Avc KolayStok: sales quotes from stock products. Additive only.
-- QuoteItem.stockProductId: the stock product a quote line came from (photo, stock deduction).
ALTER TABLE "QuoteItem" ADD COLUMN "stockProductId" TEXT;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_stockProductId_fkey"
  FOREIGN KEY ("stockProductId") REFERENCES "StockProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "QuoteItem_stockProductId_idx" ON "QuoteItem"("stockProductId");
-- Quote.source: 'kolaystok' for quotes prepared there. Quote.stockDeductedAt: set once when an
-- accepted quote took its products out of stock, so it can never be deducted twice.
ALTER TABLE "Quote" ADD COLUMN "source" TEXT;
ALTER TABLE "Quote" ADD COLUMN "stockDeductedAt" TIMESTAMP(3);
-- StockSettings.quoteAddVat: the company's last choice for "KDV %20 ekle".
ALTER TABLE "StockSettings" ADD COLUMN "quoteAddVat" BOOLEAN NOT NULL DEFAULT false;

-- Rollback:
--   ALTER TABLE "StockSettings" DROP COLUMN "quoteAddVat";
--   ALTER TABLE "Quote" DROP COLUMN "stockDeductedAt";
--   ALTER TABLE "Quote" DROP COLUMN "source";
--   DROP INDEX "QuoteItem_stockProductId_idx";
--   ALTER TABLE "QuoteItem" DROP CONSTRAINT "QuoteItem_stockProductId_fkey";
--   ALTER TABLE "QuoteItem" DROP COLUMN "stockProductId";

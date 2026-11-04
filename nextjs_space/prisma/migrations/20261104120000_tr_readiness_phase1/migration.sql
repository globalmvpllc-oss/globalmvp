-- Türkiye hazırlığı, aşama 1 — KDV, vergi dairesi, hatırlatmalar
--
-- Purely additive. Every new column is either nullable or has a default, so
-- every existing row stays valid and nothing already stored is rewritten:
--   * Company.paymentRemindersEnabled  defaults to false (reminders off)
--   * Customer.taxOffice / language    nullable
--   * Vendor.taxOffice                 nullable
--   * Invoice.sentAt and the two reminder claim stamps   nullable
--   * Event.reminderSentAt             nullable
-- plus one new index. No column, index or constraint is altered or dropped.
--
-- Generated with
--   npx prisma migrate diff --from-schema-datamodel <previous schema> --to-schema-datamodel prisma/schema.prisma --script
-- and copied verbatim.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "paymentRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "language" TEXT,
ADD COLUMN     "taxOffice" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "taxOffice" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "followUpReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "overdueReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_reminderAt_idx" ON "Event"("reminderAt");

-- Rollback (only if this migration must be undone; drops the new data):
--   DROP INDEX "Event_reminderAt_idx";
--   ALTER TABLE "Event" DROP COLUMN "reminderSentAt";
--   ALTER TABLE "Invoice" DROP COLUMN "sentAt", DROP COLUMN "overdueReminderSentAt", DROP COLUMN "followUpReminderSentAt";
--   ALTER TABLE "Vendor" DROP COLUMN "taxOffice";
--   ALTER TABLE "Customer" DROP COLUMN "taxOffice", DROP COLUMN "language";
--   ALTER TABLE "Company" DROP COLUMN "paymentRemindersEnabled";

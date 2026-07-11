ALTER TABLE "Order"
ADD COLUMN "paymentExpiryStartedAt" TIMESTAMP(3),
ADD COLUMN "checkoutSubmissionId" TEXT,
ADD COLUMN "checkoutSubmissionFingerprint" TEXT,
ADD COLUMN "paymentExceptionAt" TIMESTAMP(3),
ADD COLUMN "paymentExceptionReason" TEXT;

CREATE UNIQUE INDEX "Order_checkoutSubmissionId_key"
ON "Order"("checkoutSubmissionId");

ALTER TABLE "EmailNotification"
ADD COLUMN "paymentId" TEXT,
ADD COLUMN "deduplicationKey" TEXT;

UPDATE "EmailNotification"
SET "deduplicationKey" =
  'order:' || "orderId" || ':' || "type"::text || ':' || "recipientEmail";

ALTER TABLE "EmailNotification"
ALTER COLUMN "deduplicationKey" SET NOT NULL;

DROP INDEX IF EXISTS "EmailNotification_orderId_type_recipientEmail_key";

CREATE UNIQUE INDEX "EmailNotification_deduplicationKey_key"
ON "EmailNotification"("deduplicationKey");

CREATE INDEX "EmailNotification_paymentId_idx"
ON "EmailNotification"("paymentId");

ALTER TABLE "EmailNotification"
ADD CONSTRAINT "EmailNotification_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);
ALTER TABLE "Payment"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "PaymentStatus"
USING ("status"::text::"PaymentStatus"),
ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "PaymentStatus_old";

ALTER TABLE "Order"
ADD COLUMN "guestCheckoutFingerprint" TEXT;

CREATE INDEX "Order_guestCheckoutFingerprint_status_paymentStatus_paymentExpiresAt_idx"
ON "Order"("guestCheckoutFingerprint", "status", "paymentStatus", "paymentExpiresAt");

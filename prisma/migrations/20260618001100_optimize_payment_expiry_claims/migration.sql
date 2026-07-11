DROP INDEX "Order_status_paymentStatus_fulfillmentStatus_idx";

CREATE INDEX "Order_status_paymentStatus_fulfillmentStatus_paymentExpiresAt_idx"
ON "Order"("status", "paymentStatus", "fulfillmentStatus", "paymentExpiresAt");

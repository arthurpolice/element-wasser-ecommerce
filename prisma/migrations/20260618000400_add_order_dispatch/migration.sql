ALTER TYPE "FulfillmentStatus" ADD VALUE 'DISPATCHED';
ALTER TYPE "EmailNotificationType" ADD VALUE 'ORDER_DISPATCHED';

CREATE TYPE "ShippingCarrier" AS ENUM ('SWISS_POST');

ALTER TABLE "Order"
ADD COLUMN "dispatchCarrier" "ShippingCarrier",
ADD COLUMN "trackingNumber" TEXT,
ADD COLUMN "dispatchedAt" TIMESTAMP(3);

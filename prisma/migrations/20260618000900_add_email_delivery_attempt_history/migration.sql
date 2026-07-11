CREATE TYPE "EmailDeliveryAttemptStatus" AS ENUM (
  'SENT',
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "EmailDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "emailNotificationId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" "EmailDeliveryAttemptStatus" NOT NULL DEFAULT 'SENT',
  "sentAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lastProviderEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDeliveryAttempt_providerId_key"
ON "EmailDeliveryAttempt"("providerId");

CREATE UNIQUE INDEX "EmailDeliveryAttempt_emailNotificationId_generation_key"
ON "EmailDeliveryAttempt"("emailNotificationId", "generation");

CREATE INDEX "EmailDeliveryAttempt_emailNotificationId_idx"
ON "EmailDeliveryAttempt"("emailNotificationId");

ALTER TABLE "EmailDeliveryAttempt"
ADD CONSTRAINT "EmailDeliveryAttempt_emailNotificationId_fkey"
FOREIGN KEY ("emailNotificationId") REFERENCES "EmailNotification"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EmailDeliveryAttempt" (
  "id",
  "emailNotificationId",
  "generation",
  "providerId",
  "status",
  "sentAt",
  "deliveredAt",
  "failedAt",
  "lastError",
  "lastProviderEventAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:' || "id",
  "id",
  "deliveryGeneration",
  "providerId",
  CASE
    WHEN "status" = 'DELIVERED' THEN 'DELIVERED'::"EmailDeliveryAttemptStatus"
    WHEN "status" = 'FAILED' THEN 'FAILED'::"EmailDeliveryAttemptStatus"
    ELSE 'SENT'::"EmailDeliveryAttemptStatus"
  END,
  COALESCE("sentAt", "lastAttemptAt", "createdAt"),
  "deliveredAt",
  "failedAt",
  "lastError",
  "lastProviderEventAt",
  "createdAt",
  "updatedAt"
FROM "EmailNotification"
WHERE "providerId" IS NOT NULL;

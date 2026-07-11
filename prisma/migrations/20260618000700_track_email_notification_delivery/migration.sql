ALTER TYPE "EmailNotificationStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "EmailNotificationStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "EmailNotification"
ADD COLUMN "deliveryGeneration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "lastProviderEventAt" TIMESTAMP(3);

CREATE INDEX "EmailNotification_providerId_idx"
ON "EmailNotification"("providerId");

CREATE TABLE "ResendWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "providerEmailId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "rawPayload" JSONB,
  "payloadExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResendWebhookEvent_payloadExpiresAt_idx"
ON "ResendWebhookEvent"("payloadExpiresAt");

CREATE INDEX "ResendWebhookEvent_providerEmailId_idx"
ON "ResendWebhookEvent"("providerEmailId");

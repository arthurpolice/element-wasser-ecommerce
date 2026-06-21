-- Migration 1 was baselined on the original database after the database had
-- already been created with `db push`. Backfill the objects introduced by that
-- migration when they are absent, while remaining safe on fresh databases
-- where migration 1 ran normally.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'OrderOrigin'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "OrderOrigin" AS ENUM ('STOREFRONT', 'OWNER_DASHBOARD');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'EmailNotificationType'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "EmailNotificationType" AS ENUM ('ORDER_PLACED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'EmailNotificationStatus'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "EmailNotificationStatus" AS ENUM ('PENDING', 'SENT');
  END IF;
END
$$;

ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "origin" "OrderOrigin" NOT NULL DEFAULT 'OWNER_DASHBOARD',
DROP COLUMN IF EXISTS "guestAccessTokenHash";

CREATE TABLE IF NOT EXISTS "EmailNotification" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" "EmailNotificationType" NOT NULL,
  "status" "EmailNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "providerId" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailNotification_status_createdAt_idx"
ON "EmailNotification"("status", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailNotification_orderId_type_recipientEmail_key"
ON "EmailNotification"("orderId", "type", "recipientEmail");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmailNotification_orderId_fkey'
      AND conrelid = '"EmailNotification"'::regclass
  ) THEN
    ALTER TABLE "EmailNotification"
    ADD CONSTRAINT "EmailNotification_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

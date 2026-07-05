ALTER TABLE "Customer" ADD COLUMN "phone" TEXT;

UPDATE "Customer"
SET "phone" = "mainAddress"."phone"
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", "phone"
  FROM "Address"
  WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
  ORDER BY "customerId", "isMain" DESC, "updatedAt" DESC
) AS "mainAddress"
WHERE "Customer"."id" = "mainAddress"."customerId";

ALTER TABLE "Address" DROP COLUMN "phone";
ALTER TABLE "Address" DROP COLUMN "streetLine2";

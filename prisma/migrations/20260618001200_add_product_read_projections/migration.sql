ALTER TABLE "Product"
ADD COLUMN "approvedReviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "approvedReviewRatingSum" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" AS product
SET
  "approvedReviewCount" = aggregate."reviewCount",
  "approvedReviewRatingSum" = aggregate."ratingSum"
FROM (
  SELECT
    "productId",
    COUNT(*)::INTEGER AS "reviewCount",
    COALESCE(SUM("rating"), 0)::INTEGER AS "ratingSum"
  FROM "Review"
  WHERE "status" = 'APPROVED'
  GROUP BY "productId"
) AS aggregate
WHERE aggregate."productId" = product."id";

CREATE OR REPLACE FUNCTION maintain_product_approved_review_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'APPROVED' THEN
      UPDATE "Product"
      SET
        "approvedReviewCount" = "approvedReviewCount" - 1,
        "approvedReviewRatingSum" = "approvedReviewRatingSum" - OLD."rating"
      WHERE "id" = OLD."productId";
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW."status" = 'APPROVED' THEN
      UPDATE "Product"
      SET
        "approvedReviewCount" = "approvedReviewCount" + 1,
        "approvedReviewRatingSum" = "approvedReviewRatingSum" + NEW."rating"
      WHERE "id" = NEW."productId";
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Review_maintain_product_approved_rating"
AFTER INSERT OR UPDATE OF "status", "rating", "productId" OR DELETE
ON "Review"
FOR EACH ROW
EXECUTE FUNCTION maintain_product_approved_review_rating();

CREATE TABLE "ProductSearchReindex" (
  "productId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductSearchReindex_pkey" PRIMARY KEY ("productId")
);

CREATE INDEX "ProductSearchReindex_requestedAt_idx"
ON "ProductSearchReindex"("requestedAt");

ALTER TABLE "ProductSearchReindex"
ADD CONSTRAINT "ProductSearchReindex_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

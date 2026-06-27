import type { PrismaClient } from '../../../generated/prisma'

type ReviewRatingDb = Pick<PrismaClient, '$executeRaw' | '$queryRaw'>

type ReviewRatingDriftRow = {
  productId: string
  storedCount: number
  storedRatingSum: number
  actualCount: number
  actualRatingSum: number
}

export async function findProductReviewRatingProjectionDrift(
  db: Pick<PrismaClient, '$queryRaw'>
) {
  return db.$queryRaw<ReviewRatingDriftRow[]>`
    SELECT
      product."id" AS "productId",
      product."approvedReviewCount" AS "storedCount",
      product."approvedReviewRatingSum" AS "storedRatingSum",
      COUNT(review."id")::integer AS "actualCount",
      COALESCE(SUM(review."rating"), 0)::integer AS "actualRatingSum"
    FROM "Product" product
    LEFT JOIN "Review" review
      ON review."productId" = product."id"
      AND review."status" = 'APPROVED'
    GROUP BY product."id"
    HAVING product."approvedReviewCount" <> COUNT(review."id")::integer
      OR product."approvedReviewRatingSum" <> COALESCE(SUM(review."rating"), 0)::integer
    ORDER BY product."id" ASC
  `
}

export async function reconcileProductReviewRatingProjections(
  db: ReviewRatingDb
) {
  const updatedCount = await db.$executeRaw`
    UPDATE "Product" AS product
    SET
      "approvedReviewCount" = aggregate."reviewCount",
      "approvedReviewRatingSum" = aggregate."ratingSum"
    FROM (
      SELECT
        product_source."id" AS "productId",
        COUNT(review."id")::integer AS "reviewCount",
        COALESCE(SUM(review."rating"), 0)::integer AS "ratingSum"
      FROM "Product" product_source
      LEFT JOIN "Review" review
        ON review."productId" = product_source."id"
        AND review."status" = 'APPROVED'
      GROUP BY product_source."id"
    ) AS aggregate
    WHERE aggregate."productId" = product."id"
      AND (
        product."approvedReviewCount" <> aggregate."reviewCount"
        OR product."approvedReviewRatingSum" <> aggregate."ratingSum"
      )
  `

  return { updatedCount }
}

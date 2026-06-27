import {
  findProductReviewRatingProjectionDrift,
  reconcileProductReviewRatingProjections
} from '~/server/commerce/review-rating'
import { isAuthorizedCronRequest } from '~/server/cron-authorization'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const drift = await findProductReviewRatingProjectionDrift(db)

  if (drift.length === 0) {
    return Response.json({
      driftedProductCount: 0,
      updatedCount: 0
    })
  }

  const result = await reconcileProductReviewRatingProjections(db)

  return Response.json({
    driftedProductCount: drift.length,
    updatedCount: result.updatedCount
  })
}

import { processPendingProductSearchReindexes } from '~/server/commerce/product-search'
import { db } from '~/server/db'
import { verifyQstashSignature } from '~/server/queue/qstash'

export const POST = verifyQstashSignature(async () => {
  const result = await processPendingProductSearchReindexes(db)

  return Response.json(result)
})

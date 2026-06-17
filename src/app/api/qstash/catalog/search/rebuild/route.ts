import { z } from 'zod'

import { processProductSearchReindexBatch } from '~/server/commerce/product-search'
import { db } from '~/server/db'
import { verifyQstashSignature } from '~/server/queue/qstash'

const rebuildRequestSchema = z.object({
  productIds: z.array(z.string()).default([])
})

export const POST = verifyQstashSignature(async (request: Request) => {
  const input = rebuildRequestSchema.parse(await request.json())
  const result = await processProductSearchReindexBatch(db, input.productIds)

  return Response.json(result)
})

import { processPendingProductSearchReindexes } from '~/server/commerce/product-search'
import { isAuthorizedCronRequest } from '~/server/cron-authorization'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return Response.json(await processPendingProductSearchReindexes(db))
}

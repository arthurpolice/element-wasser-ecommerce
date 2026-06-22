import { expirePendingPaymentOrders } from '~/server/commerce/order-lifecycle'
import { isAuthorizedCronRequest } from '~/server/cron-authorization'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const cancelledOrders = await expirePendingPaymentOrders(db)

  return Response.json({
    cancelledCount: cancelledOrders.length
  })
}

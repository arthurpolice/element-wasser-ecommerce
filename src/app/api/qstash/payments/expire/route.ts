import { expirePendingPaymentOrders } from '~/server/commerce/order-lifecycle'
import { db } from '~/server/db'
import { verifyQstashSignature } from '~/server/queue/qstash'

export const POST = verifyQstashSignature(async () => {
  const cancelledOrders = await expirePendingPaymentOrders(db)

  return Response.json({
    cancelledCount: cancelledOrders.length
  })
})

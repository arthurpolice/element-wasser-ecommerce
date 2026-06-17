import { env } from '~/env'
import { expirePendingPaymentOrders } from '~/server/commerce/order-lifecycle'
import { db } from '~/server/db'

function isAuthorizedCronRequest(request: Request) {
  return (
    Boolean(env.CRON_SECRET) &&
    request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
  )
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const cancelledOrders = await expirePendingPaymentOrders(db)

  return Response.json({
    cancelledCount: cancelledOrders.length
  })
}

import { env } from '~/env'
import { deleteExpiredResendWebhookPayloads } from '~/server/commerce/resend-webhook-events'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`
  ) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const deletedPayloadCount = await deleteExpiredResendWebhookPayloads(db)
  return Response.json({ deletedPayloadCount })
}

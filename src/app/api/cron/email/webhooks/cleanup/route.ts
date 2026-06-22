import { deleteExpiredResendWebhookPayloads } from '~/server/commerce/resend-webhook-events'
import { isAuthorizedCronRequest } from '~/server/cron-authorization'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const deletedPayloadCount = await deleteExpiredResendWebhookPayloads(db)
  return Response.json({ deletedPayloadCount })
}

import { recoverPendingEmailNotifications } from '~/server/commerce/email-notifications'
import { isAuthorizedCronRequest } from '~/server/cron-authorization'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const publishedCount = await recoverPendingEmailNotifications(db)
  return Response.json({ publishedCount })
}

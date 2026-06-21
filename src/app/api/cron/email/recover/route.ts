import { env } from '~/env'
import { recoverPendingEmailNotifications } from '~/server/commerce/email-notifications'
import { db } from '~/server/db'

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`
  ) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const publishedCount = await recoverPendingEmailNotifications(db)
  return Response.json({ publishedCount })
}

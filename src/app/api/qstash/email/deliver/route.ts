import { z } from 'zod'

import { deliverEmailNotification } from '~/server/commerce/email-notifications'
import { db } from '~/server/db'
import { verifyQstashSignature } from '~/server/queue/qstash'

const inputSchema = z.object({ emailNotificationId: z.string().min(1) })

export const POST = verifyQstashSignature(async (request: Request) => {
  const input = inputSchema.parse(await request.json())
  const result = await deliverEmailNotification(db, input.emailNotificationId)
  return Response.json(
    result && 'skipped' in result ? result : { delivered: true }
  )
})

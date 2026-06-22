import { env } from '~/env'
import { processResendWebhookEvent } from '~/server/commerce/resend-webhook-events'
import { db } from '~/server/db'
import { getResendClient } from '~/server/email/resend'

export async function POST(request: Request) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return Response.json(
      { error: 'Resend webhook is not configured.' },
      { status: 503 }
    )
  }

  const payload = await request.text()
  const eventId = request.headers.get('svix-id')
  if (!eventId) {
    return Response.json(
      { error: 'Invalid webhook signature.' },
      { status: 400 }
    )
  }

  let event
  try {
    event = getResendClient().webhooks.verify({
      payload,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
      headers: {
        id: eventId,
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? ''
      }
    })
  } catch {
    return Response.json(
      { error: 'Invalid webhook signature.' },
      { status: 400 }
    )
  }

  const result = await processResendWebhookEvent(db, {
    eventId,
    event,
    rawPayload: JSON.parse(payload) as unknown
  })

  return Response.json({ received: true, duplicate: result.duplicate })
}

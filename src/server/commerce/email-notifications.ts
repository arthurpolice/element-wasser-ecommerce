import { render } from '@react-email/render'
import type { PrismaClient } from '../../../generated/prisma'

import { env } from '~/env'
import { createOrderAccessToken } from './order-access-token'
import { getSwissPostTrackingUrl } from '~/lib/order-tracking'
import { OrderCancelledEmail } from '~/server/email/templates/order-cancelled'
import { OrderDispatchedEmail } from '~/server/email/templates/order-dispatched'
import { OrderPlacedEmail } from '~/server/email/templates/order-placed'
import { PaymentConfirmedEmail } from '~/server/email/templates/payment-confirmed'
import { NewPaidOrderEmail } from '~/server/email/templates/new-paid-order'
import { getResendClient } from '~/server/email/resend'
import { isQstashConfigured, publishQstashJson } from '~/server/queue/qstash'

export const EMAIL_DELIVERY_PATH = '/api/qstash/email/deliver'
const RECOVERY_BATCH_SIZE = 50

type EmailNotificationDb = Pick<PrismaClient, 'emailNotification'>

function formatMoney(cents: number, currencyCode: string) {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: currencyCode
  }).format(cents / 100)
}

function appBaseUrl() {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

export async function publishEmailNotification(id: string) {
  if (!isQstashConfigured()) return false

  await publishQstashJson({
    path: EMAIL_DELIVERY_PATH,
    body: { emailNotificationId: id },
    deduplicationId: id,
    retries: 5
  })
  return true
}

export async function publishEmailNotificationSafely(id: string) {
  try {
    return await publishEmailNotification(id)
  } catch (error) {
    console.error('Failed to publish Email Notification.', { id, error })
    return false
  }
}

export async function deliverEmailNotification(
  db: EmailNotificationDb,
  id: string,
  deps: { resend?: ReturnType<typeof getResendClient> } = {}
) {
  const notification = await db.emailNotification.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          customer: true,
          lines: { orderBy: { createdAt: 'asc' } }
        }
      }
    }
  })

  if (!notification || notification.status === 'SENT') return notification

  const order = notification.order
  const token = notification.accessExpiresAt
    ? createOrderAccessToken(order.id, notification.accessExpiresAt)
    : null
  const url = new URL('/de/checkout/confirmation', `${appBaseUrl()}/`)
  url.searchParams.set('order', order.orderNumber)
  if (token) url.searchParams.set('token', token)

  const email = (() => {
    switch (notification.type) {
      case 'ORDER_CANCELLED':
        return OrderCancelledEmail({
          customerFirstName: order.customerFirstName,
          orderNumber: order.orderNumber,
          orderUrl: url.toString()
        })
      case 'ORDER_DISPATCHED':
        return OrderDispatchedEmail({
          customerFirstName: order.customerFirstName,
          orderNumber: order.orderNumber,
          orderUrl: url.toString(),
          trackingUrl: getSwissPostTrackingUrl(order.trackingNumber)
        })
      case 'ORDER_PLACED':
        return OrderPlacedEmail({
          customerFirstName: order.customerFirstName,
          orderNumber: order.orderNumber,
          orderUrl: url.toString()
        })
      case 'ORDER_PAYMENT_CONFIRMED':
        return PaymentConfirmedEmail({
          customerFirstName: order.customerFirstName,
          orderNumber: order.orderNumber,
          orderUrl: url.toString(),
          lines: order.lines.map((line) => ({
            productName: line.productName,
            quantity: line.quantity,
            lineTotal: formatMoney(line.lineTotalCents, order.currencyCode)
          })),
          total: formatMoney(order.totalCents, order.currencyCode)
        })
      case 'NEW_PAID_ORDER':
        return NewPaidOrderEmail({
          orderNumber: order.orderNumber,
          customerName: `${order.customerFirstName} ${order.customerLastName}`,
          customerEmail: order.customerEmail,
          shippingAddress: [
            order.shippingCompany,
            `${order.shippingFirstName} ${order.shippingLastName}`,
            order.shippingStreetLine1,
            order.shippingStreetLine2,
            `${order.shippingPostalCode} ${order.shippingCity}`,
            order.shippingCountryCode
          ].filter((part): part is string => Boolean(part)),
          lines: order.lines.map((line) => ({
            productName: line.productName,
            productSku: line.productSku,
            quantity: line.quantity,
            lineTotal: formatMoney(line.lineTotalCents, order.currencyCode)
          })),
          total: formatMoney(order.totalCents, order.currencyCode)
        })
    }
  })()
  const subject = {
    ORDER_PLACED: `Ihre Bestellung ${order.orderNumber} wurde aufgegeben`,
    ORDER_PAYMENT_CONFIRMED: `Zahlung für Bestellung ${order.orderNumber} bestätigt`,
    NEW_PAID_ORDER: `Neue bezahlte Bestellung ${order.orderNumber}`,
    ORDER_CANCELLED: `Ihre Bestellung ${order.orderNumber} wurde storniert`,
    ORDER_DISPATCHED: `Ihre Bestellung ${order.orderNumber} wurde versendet`
  }[notification.type]
  const [html, text] = await Promise.all([
    render(email),
    render(email, { plainText: true })
  ])

  try {
    const result = await (deps.resend ?? getResendClient()).emails.send(
      {
        from: env.EMAIL_FROM!,
        replyTo: env.EMAIL_REPLY_TO!,
        to: notification.recipientEmail,
        subject,
        html,
        text
      },
      { idempotencyKey: notification.id }
    )

    if (result.error) throw new Error(result.error.message)

    return db.emailNotification.update({
      where: { id },
      data: {
        status: 'SENT',
        providerId: result.data?.id,
        sentAt: new Date(),
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null
      }
    })
  } catch (error) {
    await db.emailNotification.update({
      where: { id },
      data: {
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    throw error
  }
}

export async function recoverPendingEmailNotifications(
  db: EmailNotificationDb,
  now = new Date()
) {
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000)
  const pending = await db.emailNotification.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { lastAttemptAt: null, createdAt: { lte: staleBefore } },
        { lastAttemptAt: { lte: staleBefore } }
      ]
    },
    orderBy: { createdAt: 'asc' },
    take: RECOVERY_BATCH_SIZE,
    select: { id: true }
  })

  const results = await Promise.all(
    pending.map(({ id }) => publishEmailNotificationSafely(id))
  )
  return results.filter(Boolean).length
}

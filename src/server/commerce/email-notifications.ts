import { render } from '@react-email/render'
import type { PrismaClient } from '../../../generated/prisma/client'

import { env } from '~/env'
import { createOrderAccessToken } from './order-access-token'
import { getSwissPostTrackingUrl } from '~/lib/order-tracking'
import { OrderCancelledEmail } from '~/server/email/templates/order-cancelled'
import { OrderDispatchedEmail } from '~/server/email/templates/order-dispatched'
import { OrderPlacedEmail } from '~/server/email/templates/order-placed'
import { PaymentConfirmedEmail } from '~/server/email/templates/payment-confirmed'
import { PaymentFailedEmail } from '~/server/email/templates/payment-failed'
import { NewPaidOrderEmail } from '~/server/email/templates/new-paid-order'
import { getEmailTransport } from '~/server/email/nodemailer'
// Temporary SMTP replacement for Resend:
// import { getResendClient } from '~/server/email/resend'
import {
  isQstashConfigured,
  publishQstashJson,
  qstashDeduplicationId
} from '~/server/queue/qstash'

export const EMAIL_DELIVERY_PATH = '/api/qstash/email/deliver'
const RECOVERY_BATCH_SIZE = 50
export const MAX_EMAIL_DELIVERY_ATTEMPTS = 5
export const EMAIL_DELIVERY_LEASE_MS = 5 * 60 * 1000

type EmailNotificationDb = Pick<PrismaClient, 'emailNotification'>

type EmailMessage = {
  from: string
  replyTo: string
  to: string
  subject: string
  html: string
  text: string
}

export type EmailDeliveryDevelopmentPreview = {
  delivered: false
  skipped: 'development'
  message: EmailMessage
}

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

export async function publishEmailNotification(id: string, generation = 0) {
  if (!isQstashConfigured()) return false

  await publishQstashJson({
    path: EMAIL_DELIVERY_PATH,
    body: { emailNotificationId: id },
    deduplicationId: qstashDeduplicationId(id, generation),
    retries: 5
  })
  return true
}

export async function publishEmailNotificationSafely(
  id: string,
  generation = 0
) {
  try {
    return await publishEmailNotification(id, generation)
  } catch (error) {
    console.error('Failed to publish Email Notification.', { id, error })
    return false
  }
}

export async function deliverEmailNotification(
  db: EmailNotificationDb,
  id: string,
  deps: {
    transport?: Pick<ReturnType<typeof getEmailTransport>, 'sendMail'>
    // resend?: ReturnType<typeof getResendClient>
    now?: () => Date
  } = {}
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

  if (
    !notification ||
    notification.status === 'SENT' ||
    notification.status === 'DELIVERED' ||
    notification.status === 'FAILED'
  ) {
    return notification
  }

  const claimedAt = deps.now?.() ?? new Date()
  const leaseExpiredBefore = new Date(
    claimedAt.getTime() - EMAIL_DELIVERY_LEASE_MS
  )
  const claim = await db.emailNotification.updateMany({
    where: {
      id,
      status: 'PENDING',
      deliveryGeneration: notification.deliveryGeneration,
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: leaseExpiredBefore } }
      ]
    },
    data: { lastAttemptAt: claimedAt }
  })
  if (claim.count === 0) return notification

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
      case 'PAYMENT_FAILED':
        return PaymentFailedEmail({
          customerFirstName: order.customerFirstName,
          orderNumber: order.orderNumber,
          orderUrl: url.toString()
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
    PAYMENT_FAILED: `Zahlung für Bestellung ${order.orderNumber} nicht abgeschlossen`,
    NEW_PAID_ORDER: `Neue bezahlte Bestellung ${order.orderNumber}`,
    ORDER_CANCELLED: `Ihre Bestellung ${order.orderNumber} wurde storniert`,
    ORDER_DISPATCHED: `Ihre Bestellung ${order.orderNumber} wurde versendet`
  }[notification.type]
  const [html, text] = await Promise.all([
    render(email),
    render(email, { plainText: true })
  ])
  const message = {
    from: env.EMAIL_FROM ?? 'dev@element-wasser.local',
    replyTo: env.EMAIL_REPLY_TO ?? 'dev@element-wasser.local',
    to: notification.recipientEmail,
    subject,
    html,
    text
  }

  if (env.NODE_ENV === 'development') {
    return {
      delivered: false,
      skipped: 'development',
      message
    } satisfies EmailDeliveryDevelopmentPreview
  }

  try {
    // Resend delivery is temporarily disabled in favour of SMTP.
    // const result = await (deps.resend ?? getResendClient()).emails.send(
    //   message,
    //   {
    //     idempotencyKey: `${notification.id}:${notification.deliveryGeneration}`
    //   }
    // )
    //
    // if (result.error) throw new Error(result.error.message)
    const result = await (deps.transport ?? getEmailTransport()).sendMail(
      message
    )

    const sentAt = deps.now?.() ?? new Date()
    // const providerId = result.data?.id
    const providerId = result.messageId

    return db.emailNotification.update({
      where: { id },
      data: {
        status: 'SENT',
        providerId,
        sentAt,
        failedAt: null,
        lastAttemptAt: sentAt,
        attemptCount: { increment: 1 },
        lastError: null,
        ...(providerId
          ? {
              deliveryAttempts: {
                upsert: {
                  where: {
                    emailNotificationId_generation: {
                      emailNotificationId: id,
                      generation: notification.deliveryGeneration
                    }
                  },
                  create: {
                    generation: notification.deliveryGeneration,
                    providerId,
                    status: 'SENT',
                    sentAt
                  },
                  update: {
                    providerId,
                    status: 'SENT',
                    sentAt,
                    deliveredAt: null,
                    failedAt: null,
                    lastError: null,
                    lastProviderEventAt: null
                  }
                }
              }
            }
          : {})
      }
    })
  } catch (error) {
    await db.emailNotification.update({
      where: { id },
      data: {
        status:
          notification.attemptCount + 1 >= MAX_EMAIL_DELIVERY_ATTEMPTS
            ? 'FAILED'
            : 'PENDING',
        failedAt:
          notification.attemptCount + 1 >= MAX_EMAIL_DELIVERY_ATTEMPTS
            ? (deps.now?.() ?? new Date())
            : null,
        lastAttemptAt: null,
        attemptCount: { increment: 1 },
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    throw error
  }
}

export async function retryFailedEmailNotification(
  db: EmailNotificationDb,
  id: string
) {
  const result = await db.emailNotification.updateMany({
    where: { id, status: 'FAILED' },
    data: {
      status: 'PENDING',
      deliveryGeneration: { increment: 1 },
      providerId: null,
      failedAt: null,
      lastProviderEventAt: null,
      lastError: null,
      lastAttemptAt: null
    }
  })

  if (result.count === 0) return false

  const notification = await db.emailNotification.findUnique({
    where: { id },
    select: { deliveryGeneration: true }
  })
  if (!notification) return false

  await publishEmailNotificationSafely(id, notification.deliveryGeneration)
  return true
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
    select: { id: true, deliveryGeneration: true }
  })

  const results = await Promise.all(
    pending.map(({ id, deliveryGeneration }) =>
      publishEmailNotificationSafely(id, deliveryGeneration)
    )
  )
  return results.filter(Boolean).length
}

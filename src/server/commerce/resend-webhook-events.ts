import { Prisma, type PrismaClient } from '../../../generated/prisma'
import type { WebhookEventPayload } from 'resend'

import {
  MAX_EMAIL_DELIVERY_ATTEMPTS,
  publishEmailNotificationSafely
} from './email-notifications'

const RAW_PAYLOAD_RETENTION_DAYS = 30

type ResendWebhookDb = Pick<
  PrismaClient,
  | '$transaction'
  | 'emailNotification'
  | 'emailDeliveryAttempt'
  | 'resendWebhookEvent'
>

type EmailEvent = Extract<WebhookEventPayload, { data: { email_id: string } }>

function isTrackedEmailEvent(event: WebhookEventPayload): event is EmailEvent {
  return (
    event.type === 'email.sent' ||
    event.type === 'email.delivered' ||
    event.type === 'email.bounced' ||
    event.type === 'email.failed'
  )
}

function failureMessage(event: WebhookEventPayload) {
  if (event.type === 'email.bounced') return event.data.bounce.message
  if (event.type === 'email.failed') return event.data.failed.reason
  return null
}

export async function processResendWebhookEvent(
  db: ResendWebhookDb,
  input: {
    eventId: string
    event: WebhookEventPayload
    rawPayload: unknown
    now?: Date
  }
) {
  const now = input.now ?? new Date()
  const occurredAt = new Date(input.event.created_at)
  const providerEmailId = isTrackedEmailEvent(input.event)
    ? input.event.data.email_id
    : null

  const result = await db.$transaction(async (tx) => {
    const inserted = await tx.resendWebhookEvent.createMany({
      data: [
        {
          id: input.eventId,
          type: input.event.type,
          providerEmailId,
          occurredAt,
          rawPayload: input.rawPayload as Prisma.InputJsonValue,
          payloadExpiresAt: new Date(
            now.getTime() + RAW_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000
          )
        }
      ],
      skipDuplicates: true
    })

    if (inserted.count === 0 || !providerEmailId) {
      return {
        duplicate: inserted.count === 0,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    const attempt = await tx.emailDeliveryAttempt.findUnique({
      where: { providerId: providerEmailId },
      include: { emailNotification: true }
    })

    if (
      !attempt ||
      (attempt.lastProviderEventAt && attempt.lastProviderEventAt > occurredAt)
    ) {
      return {
        duplicate: false,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    const notification = attempt.emailNotification

    if (input.event.type === 'email.sent') {
      if (attempt.status === 'SENT') {
        await tx.emailDeliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            sentAt: occurredAt,
            lastProviderEventAt: occurredAt
          }
        })
      }

      if (
        attempt.generation === notification.deliveryGeneration &&
        notification.status !== 'DELIVERED'
      ) {
        await tx.emailNotification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: notification.sentAt ?? occurredAt,
            lastProviderEventAt: occurredAt
          }
        })
      }
      return {
        duplicate: false,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    if (input.event.type === 'email.delivered') {
      await tx.emailDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: occurredAt,
          failedAt: null,
          lastError: null,
          lastProviderEventAt: occurredAt
        }
      })
      await tx.emailNotification.update({
        where: { id: notification.id },
        data: {
          status: 'DELIVERED',
          sentAt: notification.sentAt ?? occurredAt,
          deliveredAt: occurredAt,
          failedAt: null,
          lastError: null,
          lastProviderEventAt: occurredAt
        }
      })
      return {
        duplicate: false,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    if (attempt.status === 'DELIVERED') {
      return {
        duplicate: false,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    await tx.emailDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'FAILED',
        failedAt: occurredAt,
        lastError: failureMessage(input.event),
        lastProviderEventAt: occurredAt
      }
    })

    if (
      notification.status === 'DELIVERED' ||
      attempt.generation !== notification.deliveryGeneration
    ) {
      return {
        duplicate: false,
        retryNotificationId: null,
        retryGeneration: null
      }
    }

    const exhausted = notification.attemptCount >= MAX_EMAIL_DELIVERY_ATTEMPTS
    const retryGeneration = exhausted
      ? null
      : notification.deliveryGeneration + 1

    await tx.emailNotification.update({
      where: { id: notification.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        deliveryGeneration: retryGeneration ?? undefined,
        providerId: exhausted ? providerEmailId : null,
        failedAt: exhausted ? occurredAt : null,
        lastError: failureMessage(input.event),
        lastProviderEventAt: occurredAt
      }
    })

    return {
      duplicate: false,
      retryNotificationId: exhausted ? null : notification.id,
      retryGeneration
    }
  })

  if (
    result.retryNotificationId &&
    result.retryGeneration !== null &&
    result.retryGeneration !== undefined
  ) {
    await publishEmailNotificationSafely(
      result.retryNotificationId,
      result.retryGeneration
    )
  }

  return result
}

export async function deleteExpiredResendWebhookPayloads(
  db: Pick<PrismaClient, 'resendWebhookEvent'>,
  now = new Date()
) {
  const result = await db.resendWebhookEvent.updateMany({
    where: { payloadExpiresAt: { lte: now } },
    data: { rawPayload: Prisma.DbNull }
  })

  return result.count
}

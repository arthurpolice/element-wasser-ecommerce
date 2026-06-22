/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishEmailNotificationSafelyMock = vi.hoisted(() => vi.fn())

vi.mock('./email-notifications', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./email-notifications')>()
  return {
    ...original,
    publishEmailNotificationSafely: publishEmailNotificationSafelyMock
  }
})

import {
  deleteExpiredResendWebhookPayloads,
  processResendWebhookEvent
} from './resend-webhook-events'

function emailEvent(
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.failed',
  createdAt = '2026-06-21T12:00:00.000Z'
) {
  const data = {
    email_id: 'resend-1',
    created_at: createdAt,
    from: 'no-reply@example.com',
    to: ['customer@example.com'],
    subject: 'Order'
  }

  if (type === 'email.bounced') {
    return {
      type,
      created_at: createdAt,
      data: {
        ...data,
        bounce: {
          message: 'Mailbox unavailable',
          subType: 'General',
          type: 'Permanent'
        }
      }
    } as const
  }

  if (type === 'email.failed') {
    return {
      type,
      created_at: createdAt,
      data: { ...data, failed: { reason: 'Provider rejected message' } }
    } as const
  }

  return { type, created_at: createdAt, data } as const
}

function createDb(
  notification: {
    id: string
    status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED'
    sentAt: Date | null
    attemptCount: number
    lastProviderEventAt: Date | null
    deliveryGeneration: number
  } | null,
  insertedCount = 1
) {
  const db = {
    resendWebhookEvent: {
      createMany: vi.fn(async () => ({ count: insertedCount })),
      updateMany: vi.fn(async () => ({ count: 2 }))
    },
    emailNotification: {
      findFirst: vi.fn(async () => notification),
      update: vi.fn(async (input) => input)
    },
    emailDeliveryAttempt: {
      findUnique: vi.fn(async () =>
        notification
          ? {
              id: 'attempt-1',
              generation: 0,
              status: 'SENT',
              lastProviderEventAt: null,
              emailNotification: notification
            }
          : null
      ),
      update: vi.fn(async (input) => input)
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }
  return db
}

describe('Resend webhook events', () => {
  beforeEach(() => publishEmailNotificationSafelyMock.mockReset())

  it('deduplicates webhook IDs permanently', async () => {
    const db = createDb(null, 0)

    await expect(
      processResendWebhookEvent(db as never, {
        eventId: 'event-1',
        event: emailEvent('email.sent'),
        rawPayload: {}
      })
    ).resolves.toMatchObject({ duplicate: true })

    expect(db.emailNotification.findFirst).not.toHaveBeenCalled()
  })

  it('marks the current provider message delivered', async () => {
    const db = createDb({
      id: 'notification-1',
      status: 'SENT',
      sentAt: new Date('2026-06-21T11:59:00.000Z'),
      attemptCount: 1,
      lastProviderEventAt: null,
      deliveryGeneration: 0
    })

    await processResendWebhookEvent(db as never, {
      eventId: 'event-2',
      event: emailEvent('email.delivered'),
      rawPayload: {}
    })

    expect(db.emailNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' })
      })
    )
    expect(db.emailDeliveryAttempt.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerId: 'resend-1' } })
    )
  })

  it('ignores an out-of-order provider event', async () => {
    const db = createDb({
      id: 'notification-1',
      status: 'DELIVERED',
      sentAt: new Date('2026-06-21T11:59:00.000Z'),
      attemptCount: 1,
      lastProviderEventAt: new Date('2026-06-21T13:00:00.000Z'),
      deliveryGeneration: 0
    })

    await processResendWebhookEvent(db as never, {
      eventId: 'event-3',
      event: emailEvent('email.sent'),
      rawPayload: {}
    })

    expect(db.emailNotification.update).not.toHaveBeenCalled()
  })

  it('accepts a late delivery from an earlier provider attempt', async () => {
    const db = createDb({
      id: 'notification-1',
      status: 'PENDING',
      sentAt: new Date('2026-06-21T11:59:00.000Z'),
      attemptCount: 2,
      lastProviderEventAt: null,
      deliveryGeneration: 1
    } as never)
    db.emailDeliveryAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      generation: 0,
      status: 'FAILED',
      lastProviderEventAt: new Date('2026-06-21T12:00:00.000Z'),
      emailNotification: {
        id: 'notification-1',
        status: 'PENDING',
        sentAt: new Date('2026-06-21T11:59:00.000Z'),
        attemptCount: 2,
        deliveryGeneration: 1
      }
    } as never)

    await processResendWebhookEvent(db as never, {
      eventId: 'event-late-delivered',
      event: emailEvent('email.delivered', '2026-06-21T12:01:00.000Z'),
      rawPayload: {}
    })

    expect(db.emailNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' })
      })
    )
  })

  it('does not retry from a failure on a superseded provider attempt', async () => {
    const db = createDb(null)
    db.emailDeliveryAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      generation: 0,
      status: 'SENT',
      lastProviderEventAt: null,
      emailNotification: {
        id: 'notification-1',
        status: 'SENT',
        sentAt: new Date('2026-06-21T12:00:00.000Z'),
        attemptCount: 2,
        deliveryGeneration: 1
      }
    } as never)

    await processResendWebhookEvent(db as never, {
      eventId: 'event-stale-failure',
      event: emailEvent('email.bounced'),
      rawPayload: {}
    })

    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
    expect(db.emailNotification.update).not.toHaveBeenCalled()
  })

  it('publishes the next queue generation after a current attempt fails', async () => {
    const db = createDb({
      id: 'notification-1',
      status: 'SENT',
      sentAt: new Date('2026-06-21T12:00:00.000Z'),
      attemptCount: 1,
      lastProviderEventAt: null,
      deliveryGeneration: 0
    })

    await processResendWebhookEvent(db as never, {
      eventId: 'event-current-failure',
      event: emailEvent('email.bounced'),
      rawPayload: {}
    })

    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-1',
      1
    )
  })

  it('marks the fifth unsuccessful delivery failed without republishing', async () => {
    const db = createDb({
      id: 'notification-1',
      status: 'SENT',
      sentAt: new Date('2026-06-21T11:59:00.000Z'),
      attemptCount: 5,
      lastProviderEventAt: null,
      deliveryGeneration: 0
    })

    await processResendWebhookEvent(db as never, {
      eventId: 'event-4',
      event: emailEvent('email.bounced'),
      rawPayload: {}
    })

    expect(db.emailNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Mailbox unavailable'
        })
      })
    )
    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
  })

  it('deletes raw payloads after the retention deadline while keeping events', async () => {
    const db = createDb(null)

    await expect(
      deleteExpiredResendWebhookPayloads(
        db as never,
        new Date('2026-07-21T12:00:00.000Z')
      )
    ).resolves.toBe(2)

    expect(db.resendWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          payloadExpiresAt: { lte: new Date('2026-07-21T12:00:00.000Z') }
        }
      })
    )
  })
})

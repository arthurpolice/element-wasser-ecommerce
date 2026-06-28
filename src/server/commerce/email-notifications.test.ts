import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'test',
  APP_BASE_URL: 'https://store.example.com',
  ORDER_ACCESS_SECRET: 'order-access-secret-at-least-32-characters',
  EMAIL_FROM: 'no-reply@element-wasser.example',
  EMAIL_REPLY_TO: 'bestellungen@element-wasser.example',
  EMAIL_INTERNAL_RECIPIENT: 'bestellungen@element-wasser.example'
}))
const publishQstashJsonMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({ env: envMock }))
vi.mock('~/server/queue/qstash', () => ({
  isQstashConfigured: () => true,
  publishQstashJson: publishQstashJsonMock,
  qstashDeduplicationId: (...parts: Array<number | string>) =>
    parts.map((part) => String(part).replaceAll(':', '_')).join('_')
}))

import {
  deliverEmailNotification,
  publishEmailNotification,
  recoverPendingEmailNotifications,
  retryFailedEmailNotification
} from './email-notifications'

type SendInput = {
  subject: string
  html: string
  text: string
}
type SendOptions = { idempotencyKey: string }
type UpdateInput = {
  data: {
    status: string
    providerId?: string
    lastError?: string | null
    attemptCount?: { increment: number }
    deliveryAttempts?: {
      upsert: {
        create: {
          generation: number
          providerId: string
          status: string
        }
      }
    }
  }
}

const emailNotificationMocks = [
  {
    id: 'notification-1',
    type: 'ORDER_PLACED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'anna@example.com',
    accessExpiresAt: new Date('2026-07-01T12:00:00Z'),
    order: {
      id: 'order-1',
      orderNumber: 'EW-2026-00001',
      customerFirstName: 'Anna',
      customer: { userId: null }
    },
    lastError: null
  },
  {
    id: 'notification-2',
    type: 'ORDER_PLACED',
    status: 'SENT',
    attemptCount: 1,
    deliveryGeneration: 0,
    recipientEmail: 'hannah@example.com',
    accessExpiresAt: new Date('2026-07-01T12:00:00Z'),
    order: {
      id: 'order-2',
      orderNumber: 'EW-2026-00002',
      customerFirstName: 'Hannah',
      customer: { userId: null }
    },
    lastError: null
  },
  {
    id: 'notification-3',
    type: 'ORDER_CANCELLED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'river@example.com',
    accessExpiresAt: null,
    order: {
      id: 'order-3',
      orderNumber: 'EW-2026-00003',
      customerFirstName: 'River',
      customer: { userId: 'user-1' }
    },
    lastError: null
  },
  {
    id: 'notification-4',
    type: 'ORDER_CANCELLED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'guest@example.com',
    accessExpiresAt: new Date('2026-07-01T12:00:00Z'),
    order: {
      id: 'order-4',
      orderNumber: 'EW-2026-00004',
      customerFirstName: 'Gast',
      customer: { userId: null }
    },
    lastError: null
  },
  {
    id: 'notification-5',
    type: 'ORDER_DISPATCHED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'parcel@example.com',
    accessExpiresAt: null,
    order: {
      id: 'order-5',
      orderNumber: 'EW-2026-00005',
      customerFirstName: 'Pia',
      customer: { userId: 'user-5' },
      trackingNumber: '99.123'
    },
    lastError: null
  },
  {
    id: 'notification-6',
    type: 'ORDER_PAYMENT_CONFIRMED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'anna@example.com',
    accessExpiresAt: null,
    order: {
      id: 'order-6',
      orderNumber: 'EW-2026-00006',
      customerFirstName: 'Anna',
      customerLastName: 'Muster',
      customerEmail: 'anna@example.com',
      customer: { userId: 'user-6' },
      currencyCode: 'CHF',
      totalCents: 4280,
      lines: [
        {
          createdAt: new Date('2026-06-20T10:00:00Z'),
          productName: 'Mineralfilter',
          productSku: 'MF-01',
          quantity: 2,
          lineTotalCents: 4280
        }
      ]
    },
    lastError: null
  },
  {
    id: 'notification-7',
    type: 'NEW_PAID_ORDER',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'bestellungen@element-wasser.example',
    accessExpiresAt: null,
    order: {
      id: 'order-7',
      orderNumber: 'EW-2026-00007',
      customerFirstName: 'Lina',
      customerLastName: 'Meier',
      customerEmail: 'lina@example.com',
      customer: { userId: 'user-7' },
      currencyCode: 'CHF',
      totalCents: 12900,
      shippingCompany: null,
      shippingFirstName: 'Lina',
      shippingLastName: 'Meier',
      shippingStreetLine1: 'Seestrasse 10',
      shippingStreetLine2: null,
      shippingPostalCode: '8000',
      shippingCity: 'Zürich',
      shippingCountryCode: 'CH',
      lines: [
        {
          createdAt: new Date('2026-06-20T10:00:00Z'),
          productName: 'Wasserfilter',
          productSku: 'WF-10',
          quantity: 1,
          lineTotalCents: 12900
        }
      ]
    },
    lastError: null
  },
  {
    id: 'notification-8',
    type: 'PAYMENT_FAILED',
    status: 'PENDING',
    attemptCount: 0,
    deliveryGeneration: 0,
    recipientEmail: 'guest@example.com',
    accessExpiresAt: new Date('2026-07-20T12:00:00Z'),
    order: {
      id: 'order-8',
      orderNumber: 'EW-2026-00008',
      customerFirstName: 'Greta',
      customer: { userId: null },
      lines: []
    },
    lastError: null
  }
]

const createMockDb = () => ({
  emailNotification: {
    findUnique: vi.fn(
      async ({ where: { id } }: { where: { id: string } }) =>
        emailNotificationMocks.find((mock) => mock.id === id) ?? null
    ),
    update: vi.fn(async (input: UpdateInput) => input.data),
    updateMany: vi.fn(async () => ({ count: 1 }))
  }
})

describe('Email Notifications', () => {
  beforeEach(() => {
    envMock.NODE_ENV = 'test'
    publishQstashJsonMock.mockReset()
  })

  it('publishes delivery with the Email Notification ID as deduplication key', async () => {
    await publishEmailNotification('notification-1')

    expect(publishQstashJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/qstash/email/deliver',
        body: { emailNotificationId: 'notification-1' },
        deduplicationId: 'notification-1_0'
      })
    )
  })

  it('publishes an owner retry with a new queue generation', async () => {
    const db = createMockDb()
    db.emailNotification.findUnique.mockResolvedValue({
      id: 'notification-1',
      deliveryGeneration: 1
    } as never)

    await retryFailedEmailNotification(db as never, 'notification-1')

    expect(publishQstashJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationId: 'notification-1_1'
      })
    )
  })

  it('renders German Order Placed copy and sends HTML and text idempotently', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-1' },
      error: null
    }))

    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-1', {
      resend: { emails: { send } } as never
    })

    const [message, options] = send.mock.calls[0]!
    expect(message.subject).toBe(
      'Ihre Bestellung EW-2026-00001 wurde aufgegeben'
    )
    expect(message.html).toContain('Zahlungseingang wird separat bestätigt')
    expect(message.text).toContain('Bestellung ansehen')
    expect(options).toEqual({ idempotencyKey: 'notification-1:0' })
    const updateInput = db.emailNotification.update.mock.calls[0]![0]
    expect(updateInput.data.status).toBe('SENT')
    expect(updateInput.data.providerId).toBe('resend-1')
    expect(updateInput.data.deliveryAttempts).toMatchObject({
      upsert: {
        create: {
          generation: 0,
          providerId: 'resend-1',
          status: 'SENT'
        }
      }
    })
  })

  it('returns the rendered message without calling Resend in development', async () => {
    envMock.NODE_ENV = 'development'
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-1' },
      error: null
    }))
    const db = createMockDb()

    const result = await deliverEmailNotification(db as never, 'notification-1', {
      resend: { emails: { send } } as never
    })

    expect(send).not.toHaveBeenCalled()
    expect(db.emailNotification.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      delivered: false,
      skipped: 'development',
      message: {
        from: 'no-reply@element-wasser.example',
        replyTo: 'bestellungen@element-wasser.example',
        to: 'anna@example.com',
        subject: 'Ihre Bestellung EW-2026-00001 wurde aufgegeben'
      }
    })
    expect(result && 'message' in result ? result.message.text : '').toContain(
      'Bestellung ansehen'
    )
  })

  it('does not resend an already-sent notification', async () => {
    const db = createMockDb()
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-1' },
      error: null
    }))

    await deliverEmailNotification(db as never, 'notification-2', {
      resend: { emails: { send } } as never
    })

    expect(send).not.toHaveBeenCalled()
    expect(db.emailNotification.update).not.toHaveBeenCalled()
  })

  it('allows only one concurrent delivery to call the email provider', async () => {
    const db = createMockDb()
    let claimed = false
    db.emailNotification.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 }
      claimed = true
      return { count: 1 }
    })
    let releaseSend!: () => void
    const sendStarted = new Promise<void>((resolve) => {
      releaseSend = resolve
    })
    let finishSend!: () => void
    const sendCanFinish = new Promise<void>((resolve) => {
      finishSend = resolve
    })
    const send = vi.fn(async () => {
      releaseSend()
      await sendCanFinish
      return { data: { id: 'resend-1' }, error: null }
    })
    const deps = {
      resend: { emails: { send } } as never,
      now: () => new Date('2026-06-21T12:00:00Z')
    }

    const first = deliverEmailNotification(db as never, 'notification-1', deps)
    await sendStarted
    const second = deliverEmailNotification(db as never, 'notification-1', deps)
    await second
    finishSend()
    await first

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('renders German whole-Order cancellation copy with a session-authorized link', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-3' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-3', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.subject).toBe(
      'Ihre Bestellung EW-2026-00003 wurde storniert'
    )
    expect(message.html).toContain('Ihre gesamte Bestellung')
    expect(message.text).toContain('wird nicht mehr bearbeitet oder versendet')
    expect(message.html).toContain(
      'https://store.example.com/de/checkout/confirmation?order=EW-2026-00003'
    )
    expect(message.html).not.toContain('token=')
  })

  it('gives a Customer without a user account a signed cancellation link', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-4' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-4', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.text).toContain(
      'https://store.example.com/de/checkout/confirmation?order=EW-2026-00004'
    )
    expect(message.text).toContain('token=')
  })

  it('renders German dispatch copy and the derived Swiss Post tracking link', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-5' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-5', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.subject).toBe(
      'Ihre Bestellung EW-2026-00005 wurde versendet'
    )
    expect(message.text).toContain('Schweizerische Post')
    expect(message.html).toContain('formattedParcelCodes=99.123')
  })

  it('renders German customer payment confirmation from Order snapshots', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-6' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-6', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.subject).toBe(
      'Zahlung für Bestellung EW-2026-00006 bestätigt'
    )
    expect(message.html).toContain('Ihre Zahlung ist eingegangen')
    expect(message.text).toContain('2 × Mineralfilter')
    expect(message.text).toContain('CHF')
    expect(message.text).toContain('42.80')
  })

  it('renders the German merchant paid-order message from Order snapshots', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-7' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-7', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.subject).toBe('Neue bezahlte Bestellung EW-2026-00007')
    expect(message.html).toContain('Neue bezahlte Bestellung')
    expect(message.text).toContain('Wasserfilter (WF-10)')
    expect(message.text).toContain('Seestrasse 10')
    expect(message.text).toContain('129.00')
  })

  it('renders generic German Payment Failed copy with an authorized retry link', async () => {
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-8' },
      error: null
    }))
    const db = createMockDb()

    await deliverEmailNotification(db as never, 'notification-8', {
      resend: { emails: { send } } as never
    })

    const [message] = send.mock.calls[0]!
    expect(message.subject).toBe(
      'Zahlung für Bestellung EW-2026-00008 nicht abgeschlossen'
    )
    expect(message.html).toContain(
      'Ihre Zahlung konnte nicht abgeschlossen werden'
    )
    expect(message.text).toContain('Zahlung erneut versuchen')
    expect(message.text).toContain('token=')
    expect(message.text).not.toContain('Card declined')
    expect(message.text).not.toContain('Stripe')
  })

  it('records the failed attempt and rethrows the provider error', async () => {
    const db = createMockDb()
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-1' }
    }))

    send.mockRejectedValue(new Error('Failed to send email'))

    await expect(
      deliverEmailNotification(db as never, 'notification-1', {
        resend: { emails: { send } } as never
      })
    ).rejects.toThrow('Failed to send email')
    const updateInput = db.emailNotification.update.mock.calls[0]![0]
    expect(updateInput.data.status).not.toBe('SENT')
    expect(updateInput.data.lastError).toBe('Failed to send email')
    expect(updateInput.data.attemptCount?.increment).toEqual(1)
  })

  it('marks the notification failed after the fifth unsuccessful attempt', async () => {
    const db = createMockDb()
    emailNotificationMocks[0]!.attemptCount = 4
    const send = vi.fn().mockRejectedValue(new Error('Mailbox unavailable'))

    await expect(
      deliverEmailNotification(db as never, 'notification-1', {
        resend: { emails: { send } } as never
      })
    ).rejects.toThrow('Mailbox unavailable')

    const updateInput = db.emailNotification.update.mock.calls[0]![0]
    expect(updateInput.data.status).toBe('FAILED')

    emailNotificationMocks[0]!.attemptCount = 0
  })

  it('returns null when notification is not found', async () => {
    const db = createMockDb()
    const send = vi.fn(async (_input: SendInput, _options: SendOptions) => ({
      data: { id: 'resend-1' },
      error: null
    }))

    const result = await deliverEmailNotification(
      db as never,
      'notification-9',
      {
        resend: { emails: { send } } as never
      }
    )
    expect(result).toBeNull()
    expect(db.emailNotification.update).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('republishes stale pending notifications in a bounded recovery batch', async () => {
    const db = {
      emailNotification: {
        findMany: vi.fn(async () => [
          { id: 'notification-1' },
          { id: 'notification-2' }
        ])
      }
    }

    await expect(
      recoverPendingEmailNotifications(
        db as never,
        new Date('2026-06-01T12:10:00Z')
      )
    ).resolves.toBe(2)

    expect(db.emailNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    )
  })
})

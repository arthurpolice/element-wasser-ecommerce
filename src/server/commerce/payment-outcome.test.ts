import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type Stripe from 'stripe'
import type {
  OrderOrigin,
  OrderPaymentStatus,
  PaymentStatus
} from '../../../generated/prisma/client'

const publishEmailNotificationSafelyMock = vi.hoisted(() =>
  vi.fn(async () => true)
)

vi.mock('~/server/commerce/email-notifications', () => ({
  publishEmailNotificationSafely: publishEmailNotificationSafelyMock
}))

import { handleStripeWebhookEvent } from '~/server/commerce/payment-outcome'
import { firstMockCall } from '~/test/mock-calls'

type MockPayment = {
  id: string
  orderId: string
  status: PaymentStatus
  providerReference: string | null
  stripeCheckoutSessionId: string | null
  order: {
    id: string
    status: 'PLACED' | 'CANCELLED' | 'COMPLETED'
    paymentStatus: OrderPaymentStatus
    origin: OrderOrigin
    customerEmail: string
    paymentExpiresAt: Date | null
    paymentExpiryStartedAt: Date | null
    customer: { userId: string | null }
  }
}

type MockDb = {
  $queryRaw: Mock<(...args: unknown[]) => Promise<unknown[]>>
  payment: {
    findUnique: Mock<
      (args: { where: Record<string, unknown> }) => Promise<MockPayment | null>
    >
    findFirst: Mock<
      (args: { where: Record<string, unknown> }) => Promise<MockPayment | null>
    >
    update: Mock<
      (args: {
        where: { id: string }
        data: Partial<MockPayment>
      }) => Promise<MockPayment>
    >
    updateMany: Mock<
      (args: {
        where: { id: string; status: { not: PaymentStatus } }
        data: Partial<MockPayment>
      }) => Promise<{ count: number }>
    >
  }
  order: {
    findUniqueOrThrow: Mock<() => Promise<Record<string, unknown>>>
    update: Mock<
      (args: {
        where: { id: string }
        data: Partial<MockPayment['order']>
      }) => Promise<MockPayment['order']>
    >
    updateMany: Mock<
      (args: {
        where: Record<string, unknown>
        data: Partial<MockPayment['order']>
      }) => Promise<{ count: number }>
    >
  }
  emailNotification: {
    upsert: Mock<
      (args: {
        where: Record<string, unknown>
        create: {
          deduplicationKey: string
          orderId: string
          paymentId?: string
          type: string
          recipientEmail: string
          accessExpiresAt?: Date | null
        }
        update: object
      }) => Promise<{ id: string }>
    >
  }
  $transaction: Mock<(callback: (tx: MockDb) => Promise<void>) => Promise<void>>
}

function createPayment(
  overrides: Partial<Omit<MockPayment, 'order'>> & {
    order?: Partial<MockPayment['order']>
  } = {}
): MockPayment {
  const payment: MockPayment = {
    id: 'payment-1',
    orderId: 'order-1',
    status: 'PENDING',
    providerReference: null,
    stripeCheckoutSessionId: 'cs_test_123',
    order: {
      id: 'order-1',
      status: 'PLACED',
      paymentStatus: 'PENDING',
      origin: 'STOREFRONT',
      customerEmail: 'anna@example.com',
      paymentExpiresAt: new Date('2099-06-20T12:15:00Z'),
      paymentExpiryStartedAt: null,
      customer: { userId: 'user-1' }
    }
  }

  return {
    ...payment,
    ...overrides,
    order: { ...payment.order, ...overrides.order }
  }
}

function createMockDb(payment = createPayment()): MockDb {
  const db: MockDb = {
    $queryRaw: vi.fn(async () => []),
    payment: {
      findUnique: vi.fn(async () => payment),
      findFirst: vi.fn(async () => payment),
      update: vi.fn(async ({ data }) => {
        Object.assign(payment, data)
        return payment
      }),
      updateMany: vi.fn(async ({ data }) => {
        if (payment.status === 'CAPTURED') return { count: 0 }
        Object.assign(payment, data)
        return { count: 1 }
      })
    },
    order: {
      findUniqueOrThrow: vi.fn(async () => ({
        ...payment.order,
        payments: [{ status: payment.status }]
      })),
      update: vi.fn(async ({ data }) => {
        Object.assign(payment.order, data)
        return payment.order
      }),
      updateMany: vi.fn(async ({ data }) => ({
        count:
          data.paymentStatus === 'PAID' &&
          payment.order.paymentStatus === 'PAID'
            ? 0
            : 1
      }))
    },
    emailNotification: {
      upsert: vi.fn(async ({ create }) => ({
        id:
          create.type === 'ORDER_PAYMENT_CONFIRMED'
            ? 'notification-customer'
            : create.type === 'PAYMENT_FAILED'
              ? `notification-${create.paymentId}`
              : 'notification-merchant'
      }))
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

function createEvent<TObject>(type: Stripe.Event.Type, object: TObject) {
  return {
    id: `evt_${type}`,
    type,
    data: { object }
  } as unknown as Stripe.Event
}

describe('handleStripeWebhookEvent', () => {
  beforeEach(() => {
    publishEmailNotificationSafelyMock.mockClear()
  })

  it('marks a paid Checkout Session captured and creates customer and merchant notifications', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      }),
      {
        internalRecipient: 'orders@element-wasser.example',
        now: () => new Date('2026-06-20T12:00:00Z')
      }
    )

    expect(db.payment.findUnique).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      include: {
        order: { include: { customer: { select: { userId: true } } } }
      }
    })
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        stripeCheckoutSessionId: 'cs_test_123',
        failureReason: null
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAID' }
    })
    expect(db.emailNotification.upsert).toHaveBeenCalledTimes(2)
    const customerUpsertArgs = db.emailNotification.upsert.mock.calls[0]![0]
    const merchantUpsertArgs = db.emailNotification.upsert.mock.calls[1]![0]
    expect(customerUpsertArgs.create).toMatchObject({
      orderId: 'order-1',
      type: 'ORDER_PAYMENT_CONFIRMED',
      recipientEmail: 'anna@example.com',
      accessExpiresAt: null
    })
    expect(merchantUpsertArgs.create).toMatchObject({
      orderId: 'order-1',
      type: 'NEW_PAID_ORDER',
      recipientEmail: 'orders@element-wasser.example'
    })
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-customer'
    )
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-merchant'
    )
  })

  it('is idempotent when the successful Payment was already captured', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: {
          id: 'order-1',
          paymentStatus: 'PAID',
          origin: 'STOREFRONT',
          customerEmail: 'anna@example.com',
          customer: { userId: 'user-1' }
        }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentExpiryStartedAt: null }
    })
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('does not create payment communications for owner-dashboard Orders', async () => {
    const db = createMockDb(
      createPayment({
        order: {
          id: 'order-1',
          paymentStatus: 'PENDING',
          origin: 'OWNER_DASHBOARD',
          customerEmail: 'anna@example.com',
          customer: { userId: 'user-1' }
        }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: { paymentId: 'payment-1' }
      }),
      { internalRecipient: 'orders@element-wasser.example' }
    )

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAID' }
    })
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
  })

  it('records a Payment Exception when capture arrives after Order cancellation', async () => {
    const db = createMockDb()
    db.order.findUniqueOrThrow = vi.fn(async () => ({
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED'
    }))

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: { paymentId: 'payment-1' }
      }),
      { now: () => new Date('2026-06-20T12:00:00Z') }
    )

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        paymentStatus: 'PAID',
        paymentExpiryStartedAt: null,
        paymentExceptionAt: new Date('2026-06-20T12:00:00Z'),
        paymentExceptionReason: 'CAPTURED_AFTER_ORDER_CANCELLATION'
      }
    })
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('marks an expired Checkout Session cancelled without releasing stock', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.expired', {
        id: 'cs_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: { not: 'CAPTURED' } },
      data: {
        status: 'CANCELLED',
        failureReason: 'Stripe Checkout Session expired.',
        providerReference: null
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'CANCELLED' }
    })
    expect('product' in db).toBe(false)
  })

  it('ignores an expired Checkout Session when the Payment was already captured', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: {
          id: 'order-1',
          paymentStatus: 'PAID',
          origin: 'STOREFRONT',
          customerEmail: 'anna@example.com',
          customer: { userId: 'user-1' }
        }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.expired', {
        id: 'cs_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.order.updateMany).not.toHaveBeenCalled()
  })

  it('marks a failed PaymentIntent failed while keeping retry represented by failed Order Payment Status', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        },
        last_payment_error: {
          message: 'Card declined.'
        }
      })
    )

    const [paymentUpdateArgs] = firstMockCall(db.payment.updateMany)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'FAILED',
        providerReference: 'pi_test_123',
        failureReason: 'Card declined.'
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'FAILED' }
    })
    expect(db.emailNotification.upsert).toHaveBeenCalledWith({
      where: {
        deduplicationKey: 'payment:payment-1:PAYMENT_FAILED'
      },
      create: {
        deduplicationKey: 'payment:payment-1:PAYMENT_FAILED',
        orderId: 'order-1',
        paymentId: 'payment-1',
        type: 'PAYMENT_FAILED',
        recipientEmail: 'anna@example.com',
        accessExpiresAt: null
      },
      update: {}
    })
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-payment-1'
    )
  })

  it('deduplicates repeated failure events for one Payment', async () => {
    const db = createMockDb()
    const event = createEvent('payment_intent.payment_failed', {
      id: 'pi_test_123',
      metadata: { paymentId: 'payment-1' },
      last_payment_error: { message: 'Card declined.' }
    })

    await handleStripeWebhookEvent(db as never, event)
    await handleStripeWebhookEvent(db as never, event)

    expect(db.emailNotification.upsert).toHaveBeenCalledTimes(1)
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledTimes(1)
  })

  it('creates separate Payment Failed Email Notifications for separate attempts', async () => {
    const firstDb = createMockDb(createPayment({ id: 'payment-1' }))
    const secondDb = createMockDb(createPayment({ id: 'payment-2' }))

    await handleStripeWebhookEvent(
      firstDb as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_1',
        metadata: { paymentId: 'payment-1' },
        last_payment_error: { message: 'Declined.' }
      })
    )
    await handleStripeWebhookEvent(
      secondDb as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_2',
        metadata: { paymentId: 'payment-2' },
        last_payment_error: { message: 'Declined.' }
      })
    )

    expect(
      firstDb.emailNotification.upsert.mock.calls[0]![0].create
    ).toMatchObject({
      paymentId: 'payment-1',
      deduplicationKey: 'payment:payment-1:PAYMENT_FAILED'
    })
    expect(
      secondDb.emailNotification.upsert.mock.calls[0]![0].create
    ).toMatchObject({
      paymentId: 'payment-2',
      deduplicationKey: 'payment:payment-2:PAYMENT_FAILED'
    })
  })

  it('gives a Guest Customer a signed access link for Payment Retry', async () => {
    const db = createMockDb(
      createPayment({
        order: { customer: { userId: null } }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: { paymentId: 'payment-1' },
        last_payment_error: { message: 'Declined.' }
      }),
      { now: () => new Date('2026-06-20T12:00:00Z') }
    )

    const create = db.emailNotification.upsert.mock.calls[0]![0].create
    expect(create.accessExpiresAt).toEqual(new Date('2026-07-20T12:00:00.000Z'))
  })

  it('does not notify after the Order Payment Window has expired', async () => {
    const db = createMockDb(
      createPayment({
        order: {
          paymentExpiresAt: new Date('2026-06-20T11:59:00Z')
        }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: { paymentId: 'payment-1' },
        last_payment_error: { message: 'Declined.' }
      }),
      { now: () => new Date('2026-06-20T12:00:00Z') }
    )

    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
  })

  it('does not create Payment Failed Email Notifications for owner-dashboard Orders', async () => {
    const db = createMockDb(
      createPayment({
        order: { origin: 'OWNER_DASHBOARD' }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: { paymentId: 'payment-1' },
        last_payment_error: { message: 'Declined.' }
      })
    )

    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
  })

  it('ignores a failed PaymentIntent when the Payment was already captured', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: {
          id: 'order-1',
          paymentStatus: 'PAID',
          origin: 'STOREFRONT',
          customerEmail: 'anna@example.com',
          customer: { userId: 'user-1' }
        }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        },
        last_payment_error: {
          message: 'Card declined.'
        }
      })
    )

    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.order.updateMany).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
    expect(publishEmailNotificationSafelyMock).not.toHaveBeenCalled()
  })

  it('ignores unrelated Stripe events', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('charge.refunded', {
        id: 'ch_test_123'
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.order.updateMany).not.toHaveBeenCalled()
  })

  it('does not let an older failed Payment overwrite another captured Payment', async () => {
    const failedPayment = createPayment({ id: 'payment-failed' })
    const capturedPayment = createPayment({ id: 'payment-captured' })
    let orderPaymentStatus: OrderPaymentStatus = 'PENDING'
    let releaseFailedUpdate!: () => void
    const failedUpdateCanContinue = new Promise<void>((resolve) => {
      releaseFailedUpdate = resolve
    })
    let failedUpdateStarted!: () => void
    const failedUpdateHasStarted = new Promise<void>((resolve) => {
      failedUpdateStarted = resolve
    })

    const db = createMockDb()
    db.payment.findUnique = vi.fn(async ({ where }) =>
      where.id === failedPayment.id ? failedPayment : capturedPayment
    )
    db.payment.updateMany = vi.fn(async ({ where }) => {
      if (where.id === failedPayment.id) {
        failedUpdateStarted()
        await failedUpdateCanContinue
        failedPayment.status = 'FAILED'
      }
      return { count: 1 }
    })
    db.payment.update = vi.fn(async ({ where, data }) => {
      const payment =
        where.id === capturedPayment.id ? capturedPayment : failedPayment
      Object.assign(payment, data)
      return payment
    })
    db.order.findUniqueOrThrow = vi.fn(async () => ({
      status: 'PLACED',
      paymentStatus: orderPaymentStatus,
      paymentExpiresAt: new Date('2099-06-20T12:15:00Z'),
      payments: [
        { status: failedPayment.status },
        { status: capturedPayment.status }
      ]
    }))
    db.order.update = vi.fn(async ({ data }) => {
      orderPaymentStatus = data.paymentStatus ?? orderPaymentStatus
      return {
        ...capturedPayment.order,
        paymentStatus: orderPaymentStatus
      }
    })

    const failure = handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_failed',
        metadata: { paymentId: failedPayment.id },
        last_payment_error: { message: 'Declined.' }
      })
    )
    await failedUpdateHasStarted

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_captured',
        payment_status: 'paid',
        payment_intent: 'pi_captured',
        metadata: { paymentId: capturedPayment.id }
      }),
      { internalRecipient: 'orders@element-wasser.example' }
    )

    releaseFailedUpdate()
    await failure

    expect(orderPaymentStatus).toBe('PAID')
  })
})

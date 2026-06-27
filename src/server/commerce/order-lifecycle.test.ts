import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type {
  FulfillmentStatus,
  OrderOrigin,
  OrderPaymentStatus,
  OrderStatus
} from '../../../generated/prisma'

const publishEmailNotificationSafelyMock = vi.hoisted(() => vi.fn())
const expireStripeCheckoutSessionMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/commerce/email-notifications', () => ({
  publishEmailNotificationSafely: publishEmailNotificationSafelyMock
}))

vi.mock('~/server/payments/stripe-checkout', () => ({
  expireStripeCheckoutSession: expireStripeCheckoutSessionMock
}))

import {
  cancelOrder,
  dispatchOrder,
  expirePendingPaymentOrders,
  fulfillOrder,
  type OrderLifecycleError
} from '~/server/commerce/order-lifecycle'
import { firstMockCall } from '~/test/mock-calls'

const now = new Date('2026-05-15T10:00:00Z')

beforeEach(() => {
  publishEmailNotificationSafelyMock.mockReset()
  expireStripeCheckoutSessionMock.mockReset()
  expireStripeCheckoutSessionMock.mockResolvedValue({})
})

type MockOrder = {
  id: string
  orderNumber: string
  customerEmail: string
  customer: { userId: string | null }
  origin: OrderOrigin
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  fulfillmentStatus: FulfillmentStatus
  dispatchCarrier: 'SWISS_POST' | null
  trackingNumber: string | null
  dispatchedAt: Date | null
  completedAt: Date | null
  paymentExpiresAt: Date
  paymentExpiryStartedAt: Date | null
  lines: Array<{ productId: string; quantity: number }>
  payments?: Array<{
    id: string
    status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'CANCELLED'
    stripeCheckoutSessionId: string | null
  }>
}

type OrderUpdateArgs = {
  where: { id: string }
  data: Record<string, unknown>
  include?: unknown
}

type OrderFindManyArgs = {
  where: Record<string, unknown>
  include?: unknown
}

type EmailNotificationUpsertArgs = {
  create: { accessExpiresAt: Date | null }
}

type MockDb = {
  $queryRaw: Mock<(...args: unknown[]) => Promise<unknown[]>>
  order: {
    findUnique: Mock<() => Promise<MockOrder>>
    findUniqueOrThrow: Mock<() => Promise<MockOrder>>
    findMany: Mock<(args: OrderFindManyArgs) => Promise<MockOrder[]>>
    updateMany: Mock<
      (args: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => Promise<{ count: number }>
    >
    update: Mock<
      (args: OrderUpdateArgs) => Promise<MockOrder & Record<string, unknown>>
    >
  }
  product: {
    update: Mock<() => Promise<null>>
  }
  payment: {
    updateMany: Mock<
      (args: {
        where: Record<string, unknown>
        data: { status: string }
      }) => Promise<{ count: number }>
    >
  }
  emailNotification: {
    upsert: Mock<(args: EmailNotificationUpsertArgs) => Promise<{ id: string }>>
  }
  $transaction: Mock<
    (callback: (tx: MockDb) => Promise<unknown>) => Promise<unknown>
  >
}

function createOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  const order: MockOrder = {
    id: 'order-1',
    orderNumber: 'EW-2026-00001',
    customerEmail: 'anna@example.com',
    customer: { userId: null },
    origin: 'OWNER_DASHBOARD',
    status: 'PLACED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    dispatchCarrier: null,
    trackingNumber: null,
    dispatchedAt: null,
    completedAt: null,
    paymentExpiresAt: new Date('2026-05-15T09:59:00Z'),
    paymentExpiryStartedAt: null,
    lines: [{ productId: 'product-1', quantity: 2 }],
    ...overrides
  }
  order.payments ??=
    order.paymentStatus === 'PAID'
      ? [
          {
            id: 'payment-1',
            status: 'CAPTURED',
            stripeCheckoutSessionId: 'cs_test_123'
          }
        ]
      : order.paymentStatus === 'PENDING'
        ? [
            {
              id: 'payment-1',
              status: 'PENDING',
              stripeCheckoutSessionId: null
            }
          ]
        : []
  return order
}

function createMockDb(order = createOrder()): MockDb {
  const db: MockDb = {
    $queryRaw: vi.fn(async () => [{ id: order.id }]),
    order: {
      findUnique: vi.fn(async () => order),
      findUniqueOrThrow: vi.fn(async () => order),
      findMany: vi.fn(async () => [order]),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(order, data)
        return { count: 1 }
      }),
      update: vi.fn(async ({ data }) => {
        Object.assign(order, data)
        return order
      })
    },
    product: {
      update: vi.fn(async () => null)
    },
    payment: {
      updateMany: vi.fn(async ({ data }: { data: { status: string } }) => {
        for (const payment of order.payments ?? []) {
          payment.status = data.status as never
        }
        return { count: 1 }
      })
    },
    emailNotification: {
      upsert: vi.fn(async () => ({ id: 'notification-1' }))
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

describe('cancelOrder', () => {
  it('cancels an owner-dashboard Order, releases its Stock Reservation, and creates one guest notification', async () => {
    const db = createMockDb()

    await cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(
      db.$queryRaw.mock.calls.some(([query]) =>
        String(query).includes(
          'SET "stockReserved" = product."stockReserved" - requested."quantity"'
        )
      )
    ).toBe(true)
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toMatchObject({
      where: { id: 'order-1' },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now
      }
    })
    expect(orderUpdateArgs.include).toBeDefined()
    expect(db.emailNotification.upsert).toHaveBeenCalledWith({
      where: {
        deduplicationKey: 'order:order-1:ORDER_CANCELLED:anna@example.com'
      },
      create: {
        deduplicationKey: 'order:order-1:ORDER_CANCELLED:anna@example.com',
        orderId: 'order-1',
        type: 'ORDER_CANCELLED',
        recipientEmail: 'anna@example.com',
        accessExpiresAt: new Date('2026-06-14T10:00:00Z')
      },
      update: {}
    })
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-1'
    )
  })

  it('cancels a storefront Order for a registered Customer without changing its paid payment status', async () => {
    const db = createMockDb(
      createOrder({
        paymentStatus: 'PAID',
        origin: 'STOREFRONT',
        customer: { userId: 'user-1' }
      })
    )

    await cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs.data).toMatchObject({
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED'
    })
    const [emailNotificationUpsertArgs] = firstMockCall(
      db.emailNotification.upsert
    )
    expect(emailNotificationUpsertArgs.create.accessExpiresAt).toBeNull()
  })

  it('does not release stock again for an already-cancelled Order', async () => {
    const db = createMockDb(
      createOrder({
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED'
      })
    )

    await cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('rejects fulfilled Orders', async () => {
    const db = createMockDb(createOrder({ fulfillmentStatus: 'FULFILLED' }))

    await expect(
      cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })
    ).rejects.toMatchObject({
      code: 'ORDER_ALREADY_FULFILLED'
    } satisfies Partial<OrderLifecycleError>)
  })

  it('rejects cancellation after Dispatch without releasing stock or emailing', async () => {
    const db = createMockDb(
      createOrder({
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DISPATCHED',
        dispatchCarrier: 'SWISS_POST',
        trackingNumber: '99.123',
        dispatchedAt: now
      })
    )

    await expect(
      cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })
    ).rejects.toMatchObject({
      code: 'ORDER_ALREADY_DISPATCHED'
    } satisfies Partial<OrderLifecycleError>)

    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })
})

describe('fulfillOrder', () => {
  it('completes Fulfillment for a dispatched Order while preserving Dispatch details', async () => {
    const dispatchedAt = new Date('2026-05-14T10:00:00Z')
    const db = createMockDb(
      createOrder({
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DISPATCHED',
        dispatchCarrier: 'SWISS_POST',
        trackingNumber: '99.123',
        dispatchedAt
      })
    )

    await fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(
      db.$queryRaw.mock.calls.some(([query]) =>
        String(query).includes(
          '"stockOnHand" = product."stockOnHand" - requested."quantity"'
        )
      )
    ).toBe(true)
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toMatchObject({
      where: { id: 'order-1' },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'FULFILLED',
        completedAt: now
      }
    })
    expect(orderUpdateArgs.include).toBeDefined()
    expect(orderUpdateArgs.data).not.toHaveProperty('dispatchCarrier')
    expect(orderUpdateArgs.data).not.toHaveProperty('trackingNumber')
    expect(orderUpdateArgs.data).not.toHaveProperty('dispatchedAt')
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('rejects pending-payment Orders', async () => {
    const db = createMockDb(createOrder({ fulfillmentStatus: 'DISPATCHED' }))

    await expect(
      fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })
    ).rejects.toMatchObject({
      code: 'ORDER_PAYMENT_NOT_PAID'
    } satisfies Partial<OrderLifecycleError>)
  })

  it('rejects Fulfillment Completion before Dispatch', async () => {
    const db = createMockDb(createOrder({ paymentStatus: 'PAID' }))

    await expect(
      fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })
    ).rejects.toMatchObject({
      code: 'ORDER_NOT_DISPATCHED'
    } satisfies Partial<OrderLifecycleError>)

    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('does not consume stock again for an already-fulfilled Order', async () => {
    const db = createMockDb(
      createOrder({
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'FULFILLED'
      })
    )

    await fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })
})

describe('dispatchOrder', () => {
  it('dispatches a paid Order with Swiss Post details and one notification', async () => {
    const db = createMockDb(createOrder({ paymentStatus: 'PAID' }))

    await dispatchOrder(
      db as never,
      { orderId: 'order-1', trackingNumber: ' 99.123 ' },
      { now: () => now }
    )

    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs.data).toMatchObject({
      fulfillmentStatus: 'DISPATCHED',
      dispatchCarrier: 'SWISS_POST',
      trackingNumber: '99.123',
      dispatchedAt: now
    })
    expect(db.emailNotification.upsert).toHaveBeenCalledTimes(1)
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledWith(
      'notification-1'
    )
  })

  it('is idempotent for an already-dispatched Order', async () => {
    const db = createMockDb(
      createOrder({
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DISPATCHED'
      })
    )

    await dispatchOrder(db as never, { orderId: 'order-1' })

    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('rejects an unpaid Order', async () => {
    const db = createMockDb()

    await expect(
      dispatchOrder(db as never, { orderId: 'order-1' })
    ).rejects.toMatchObject({ code: 'ORDER_PAYMENT_NOT_PAID' })
  })
})

describe('Dispatch to Fulfillment Completion sequence', () => {
  it('moves UNFULFILLED to DISPATCHED to FULFILLED with one Dispatch email only', async () => {
    const order = createOrder({ paymentStatus: 'PAID' })
    const db = createMockDb(order)
    const dispatchedAt = new Date('2026-05-15T09:00:00Z')

    await dispatchOrder(
      db as never,
      { orderId: order.id, trackingNumber: '99.123' },
      { now: () => dispatchedAt }
    )
    await fulfillOrder(db as never, { orderId: order.id }, { now: () => now })

    expect(order.status).toBe('COMPLETED')
    expect(order.fulfillmentStatus).toBe('FULFILLED')
    expect(order.completedAt).toEqual(now)
    expect(order.dispatchCarrier).toBe('SWISS_POST')
    expect(order.trackingNumber).toBe('99.123')
    expect(order.dispatchedAt).toEqual(dispatchedAt)
    expect(db.emailNotification.upsert).toHaveBeenCalledTimes(1)
    expect(publishEmailNotificationSafelyMock).toHaveBeenCalledTimes(1)
  })
})

describe('expirePendingPaymentOrders', () => {
  it('cancels expired open unpaid Orders and releases their Stock Reservations', async () => {
    const db = createMockDb()

    await expirePendingPaymentOrders(db as never, { now: () => now })

    const [claimQuery, claimCutoff, leaseCutoff, batchSize] = firstMockCall(
      db.$queryRaw
    )
    expect(String(claimQuery)).toContain('FOR UPDATE SKIP LOCKED')
    expect(String(claimQuery)).toContain('"paymentExpiryStartedAt" IS NULL')
    expect(claimCutoff).toEqual(now)
    expect(leaseCutoff).toEqual(new Date('2026-05-15T09:50:00Z'))
    expect(batchSize).toBe(50)

    const [orderFindManyArgs] = firstMockCall(db.order.findMany)
    expect(orderFindManyArgs).toMatchObject({
      where: { id: { in: ['order-1'] } },
      orderBy: [{ paymentExpiresAt: 'asc' }, { id: 'asc' }]
    })
    expect(orderFindManyArgs.include).toBeDefined()
    expect(
      db.$queryRaw.mock.calls.some(([query]) =>
        String(query).includes(
          'SET "stockReserved" = product."stockReserved" - requested."quantity"'
        )
      )
    ).toBe(true)
    const [orderUpdateArgs] = firstMockCall(db.order.updateMany)
    expect(orderUpdateArgs).toEqual({
      where: { id: { in: ['order-1'] } },
      data: { paymentExpiryStartedAt: now }
    })
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('does not release Stock Reservations after its lease has been replaced', async () => {
    const order = createOrder()
    const db = createMockDb(order)
    let transactionCount = 0

    db.$transaction = vi.fn(async (callback) => {
      transactionCount += 1
      if (transactionCount === 2) {
        order.paymentExpiryStartedAt = new Date('2026-05-15T10:01:00Z')
      }
      return callback(db)
    })

    const orders = await expirePendingPaymentOrders(db as never, {
      now: () => now
    })

    expect(orders).toEqual([])
    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })

  it('does not release Stock Reservations when Payment wins after the claim', async () => {
    const order = createOrder()
    const db = createMockDb(order)
    let transactionCount = 0

    db.$transaction = vi.fn(async (callback) => {
      transactionCount += 1
      if (transactionCount === 2) {
        order.paymentStatus = 'PAID'
      }
      return callback(db)
    })

    const orders = await expirePendingPaymentOrders(db as never, {
      now: () => now
    })

    expect(orders).toEqual([])
    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentExpiryStartedAt: null }
    })
  })

  it('keeps the lease for retry when Stripe expiry fails', async () => {
    const order = createOrder({
      payments: [
        {
          id: 'payment-1',
          status: 'PENDING',
          stripeCheckoutSessionId: 'cs_test_123'
        }
      ]
    })
    const db = createMockDb(order)
    expireStripeCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Stripe unavailable')
    )

    const orders = await expirePendingPaymentOrders(db as never, {
      now: () => now
    })

    expect(orders).toEqual([])
    expect(order.paymentExpiryStartedAt).toEqual(now)
    expect(db.product.update).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })
})

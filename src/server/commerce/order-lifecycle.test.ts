import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type {
  FulfillmentStatus,
  OrderOrigin,
  OrderPaymentStatus,
  OrderStatus
} from '../../../generated/prisma'

const publishEmailNotificationSafelyMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/commerce/email-notifications', () => ({
  publishEmailNotificationSafely: publishEmailNotificationSafelyMock
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

type MockOrder = {
  id: string
  orderNumber: string
  customerEmail: string
  customer: { userId: string | null }
  origin: OrderOrigin
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  fulfillmentStatus: FulfillmentStatus
  paymentExpiresAt: Date
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
    paymentExpiresAt: new Date('2026-05-15T09:59:00Z'),
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
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async () => order),
      findUniqueOrThrow: vi.fn(async () => order),
      findMany: vi.fn(async () => [order]),
      updateMany: vi.fn(async () => ({ count: 1 })),
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

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stockReserved: { decrement: 2 } }
    })
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
})

describe('fulfillOrder', () => {
  it('marks a paid unfulfilled Order fulfilled and consumes reserved stock', async () => {
    const db = createMockDb(createOrder({ paymentStatus: 'PAID' }))

    await fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: {
        stockOnHand: { decrement: 2 },
        stockReserved: { decrement: 2 }
      }
    })
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
  })

  it('rejects pending-payment Orders', async () => {
    const db = createMockDb()

    await expect(
      fulfillOrder(db as never, { orderId: 'order-1' }, { now: () => now })
    ).rejects.toMatchObject({
      code: 'ORDER_PAYMENT_NOT_PAID'
    } satisfies Partial<OrderLifecycleError>)
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

describe('expirePendingPaymentOrders', () => {
  it('cancels expired open unpaid Orders and releases their Stock Reservations', async () => {
    const db = createMockDb()

    await expirePendingPaymentOrders(db as never, { now: () => now })

    const [orderFindManyArgs] = firstMockCall(db.order.findMany)
    expect(orderFindManyArgs).toMatchObject({
      where: {
        status: 'PLACED',
        paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: { lte: now }
      }
    })
    expect(orderFindManyArgs.include).toBeDefined()
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stockReserved: { decrement: 2 } }
    })
    const [orderUpdateArgs] = firstMockCall(db.order.updateMany)
    expect(orderUpdateArgs).toEqual({
      where: {
        id: 'order-1',
        status: 'PLACED',
        paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: { lte: now }
      },
      data: { paymentExpiryStartedAt: now }
    })
    expect(db.emailNotification.upsert).not.toHaveBeenCalled()
  })

  it('does not release Stock Reservations when payment wins the expiry race', async () => {
    const db = createMockDb()
    db.order.updateMany = vi.fn(async () => ({ count: 0 }))

    const orders = await expirePendingPaymentOrders(db as never, {
      now: () => now
    })

    expect(orders).toEqual([])
    expect(db.product.update).not.toHaveBeenCalled()
  })
})

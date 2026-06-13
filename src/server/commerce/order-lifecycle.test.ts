import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type {
  FulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus
} from '../../../generated/prisma'

import {
  cancelOrder,
  expirePendingPaymentOrders,
  fulfillOrder,
  type OrderLifecycleError
} from '~/server/commerce/order-lifecycle'
import { firstMockCall } from '~/test/mock-calls'

const now = new Date('2026-05-15T10:00:00Z')

type MockOrder = {
  id: string
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  fulfillmentStatus: FulfillmentStatus
  paymentExpiresAt: Date
  lines: Array<{ productId: string; quantity: number }>
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

type MockDb = {
  order: {
    findUnique: Mock<() => Promise<MockOrder>>
    findMany: Mock<(args: OrderFindManyArgs) => Promise<MockOrder[]>>
    update: Mock<
      (args: OrderUpdateArgs) => Promise<MockOrder & Record<string, unknown>>
    >
  }
  product: {
    update: Mock<() => Promise<null>>
  }
  $transaction: Mock<
    (callback: (tx: MockDb) => Promise<unknown>) => Promise<unknown>
  >
}

function createOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    id: 'order-1',
    status: 'PLACED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    paymentExpiresAt: new Date('2026-05-15T09:59:00Z'),
    lines: [{ productId: 'product-1', quantity: 2 }],
    ...overrides
  }
}

function createMockDb(order = createOrder()): MockDb {
  const db: MockDb = {
    order: {
      findUnique: vi.fn(async () => order),
      findMany: vi.fn(async () => [order]),
      update: vi.fn(async ({ data }) => ({ ...order, ...data }))
    },
    product: {
      update: vi.fn(async () => null)
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

describe('cancelOrder', () => {
  it('cancels a pending-payment unfulfilled Order and releases its Stock Reservation', async () => {
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
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now
      }
    })
    expect(orderUpdateArgs.include).toBeDefined()
  })

  it('cancels a paid unfulfilled Order without changing its paid payment status', async () => {
    const db = createMockDb(createOrder({ paymentStatus: 'PAID' }))

    await cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs.data).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'CANCELLED'
    })
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
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toMatchObject({
      where: { id: 'order-1' },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now
      }
    })
    expect(orderUpdateArgs.include).toBeDefined()
  })
})

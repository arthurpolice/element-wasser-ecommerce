import { describe, expect, it, vi } from 'vitest'

import {
  cancelOrder,
  expirePendingPaymentOrders,
  fulfillOrder,
  type OrderLifecycleError
} from '~/server/commerce/order-lifecycle'

const now = new Date('2026-05-15T10:00:00Z')

function createOrder(overrides: Record<string, unknown> = {}) {
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

function createMockDb(order = createOrder()) {
  const db = {
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
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now
      },
      include: expect.any(Object)
    })
  })

  it('cancels a paid unfulfilled Order without changing its paid payment status', async () => {
    const db = createMockDb(createOrder({ paymentStatus: 'PAID' }))

    await cancelOrder(db as never, { orderId: 'order-1' }, { now: () => now })

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'CANCELLED'
        })
      })
    )
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
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'FULFILLED',
        completedAt: now
      },
      include: expect.any(Object)
    })
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
  it('cancels expired payment-pending Orders and releases their Stock Reservations', async () => {
    const db = createMockDb()

    await expirePendingPaymentOrders(db as never, { now: () => now })

    expect(db.order.findMany).toHaveBeenCalledWith({
      where: {
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: { lte: now }
      },
      include: expect.any(Object)
    })
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stockReserved: { decrement: 2 } }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now
      },
      include: expect.any(Object)
    })
  })
})

import type { Prisma, PrismaClient } from '../../../generated/prisma'

import {
  orderListInclude,
  type OrderListRow
} from '~/server/commerce/order-placement'

export const orderLifecycleInclude = {
  ...orderListInclude
} satisfies Prisma.OrderInclude

type OrderLifecycleRow = Prisma.OrderGetPayload<{
  include: typeof orderLifecycleInclude
}>

export type OrderLifecycleErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_FULFILLED'
  | 'ORDER_PAYMENT_NOT_PAID'
  | 'ORDER_CANCELLED'

export class OrderLifecycleError extends Error {
  constructor(
    readonly code: OrderLifecycleErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OrderLifecycleError'
  }
}

type OrderLifecycleDeps = {
  now?: () => Date
}

type Db = Pick<PrismaClient, '$transaction'>

function nowFromDeps(deps: OrderLifecycleDeps) {
  return deps.now?.() ?? new Date()
}

async function findOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<OrderLifecycleRow> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: orderLifecycleInclude
  })

  if (!order) {
    throw new OrderLifecycleError('ORDER_NOT_FOUND', 'Order not found.')
  }

  return order
}

async function releaseStockReservation(
  tx: Prisma.TransactionClient,
  order: Pick<OrderLifecycleRow, 'lines'>
) {
  for (const line of order.lines) {
    await tx.product.update({
      where: { id: line.productId },
      data: { stockReserved: { decrement: line.quantity } }
    })
  }
}

async function consumeStockReservation(
  tx: Prisma.TransactionClient,
  order: Pick<OrderLifecycleRow, 'lines'>
) {
  for (const line of order.lines) {
    await tx.product.update({
      where: { id: line.productId },
      data: {
        stockOnHand: { decrement: line.quantity },
        stockReserved: { decrement: line.quantity }
      }
    })
  }
}

export async function cancelOrder(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const cancelledAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    const order = await findOrder(tx, input.orderId)

    if (order.status === 'CANCELLED') {
      return order
    }

    if (order.fulfillmentStatus === 'FULFILLED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_FULFILLED',
        'Fulfilled Orders cannot be cancelled.'
      )
    }

    await releaseStockReservation(tx, order)

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        paymentStatus: order.paymentStatus === 'PAID' ? 'PAID' : 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt
      },
      include: orderListInclude
    })
  })
}

export async function fulfillOrder(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const completedAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    const order = await findOrder(tx, input.orderId)

    if (order.fulfillmentStatus === 'FULFILLED') {
      return order
    }

    if (order.status === 'CANCELLED') {
      throw new OrderLifecycleError(
        'ORDER_CANCELLED',
        'Cancelled Orders cannot be fulfilled.'
      )
    }

    if (order.paymentStatus !== 'PAID') {
      throw new OrderLifecycleError(
        'ORDER_PAYMENT_NOT_PAID',
        'Only paid Orders can be fulfilled.'
      )
    }

    await consumeStockReservation(tx, order)

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'FULFILLED',
        completedAt
      },
      include: orderListInclude
    })
  })
}

export async function expirePendingPaymentOrders(
  db: Db,
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow[]> {
  const cancelledAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    const expiredOrders = await tx.order.findMany({
      where: {
        status: 'PLACED',
        paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: { lte: cancelledAt }
      },
      include: orderLifecycleInclude
    })

    const cancelledOrders: OrderListRow[] = []

    for (const order of expiredOrders) {
      await releaseStockReservation(tx, order)
      const cancelledOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          fulfillmentStatus: 'CANCELLED',
          cancelledAt
        },
        include: orderListInclude
      })
      cancelledOrders.push(cancelledOrder)
    }

    return cancelledOrders
  })
}

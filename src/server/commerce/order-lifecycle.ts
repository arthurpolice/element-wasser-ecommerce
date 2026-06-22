import type { Prisma, PrismaClient } from '../../../generated/prisma'

import {
  orderListInclude,
  type OrderListRow
} from '~/server/commerce/order-placement'
import { getOrderAccessExpiry } from '~/server/commerce/order-access-token'
import { publishEmailNotificationSafely } from '~/server/commerce/email-notifications'
import { orderEmailNotificationKey } from '~/server/commerce/email-notification-key'
import { SWISS_POST_CARRIER_CODE } from '~/lib/order-tracking'
import { expireStripeCheckoutSession } from '~/server/payments/stripe-checkout'
import { projectOrderPaymentStatus } from '~/server/commerce/payment-outcome'

export const orderLifecycleInclude = {
  ...orderListInclude
} satisfies Prisma.OrderInclude

type OrderLifecycleRow = Prisma.OrderGetPayload<{
  include: typeof orderLifecycleInclude
}>

export type OrderLifecycleErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_FULFILLED'
  | 'ORDER_ALREADY_DISPATCHED'
  | 'ORDER_NOT_DISPATCHED'
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

function normalizeTrackingNumber(value: string | undefined) {
  const trackingNumber = value?.trim()
  if (!trackingNumber) return null
  return trackingNumber
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
  const current = await db.$transaction((tx) => findOrder(tx, input.orderId))
  const activePayment = (current.payments ?? []).find(
    (payment) => payment.status === 'PENDING'
  )

  if (
    current.paymentStatus !== 'PAID' &&
    activePayment?.stripeCheckoutSessionId
  ) {
    await expireStripeCheckoutSession(activePayment.stripeCheckoutSessionId)
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
    const order = await findOrder(tx, input.orderId)

    if (order.status === 'CANCELLED') {
      return { order, emailNotificationId: null }
    }

    if (order.fulfillmentStatus === 'DISPATCHED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_DISPATCHED',
        'Dispatched Orders cannot be cancelled.'
      )
    }

    if (order.fulfillmentStatus === 'FULFILLED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_FULFILLED',
        'Fulfilled Orders cannot be cancelled.'
      )
    }

    await releaseStockReservation(tx, order)
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        failureReason: 'Order cancelled by merchant.'
      }
    })

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt
      },
      include: orderListInclude
    })
    await projectOrderPaymentStatus(tx, order.id, cancelledAt)
    const cancelledOrder = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderListInclude
    })

    const emailNotification = await tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_CANCELLED',
          recipientEmail: order.customerEmail
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_CANCELLED',
          recipientEmail: order.customerEmail
        }),
        orderId: order.id,
        type: 'ORDER_CANCELLED',
        recipientEmail: order.customerEmail,
        accessExpiresAt: order.customer.userId
          ? null
          : getOrderAccessExpiry(cancelledAt)
      },
      update: {}
    })

    return {
      order: cancelledOrder,
      emailNotificationId: emailNotification.id
    }
  })

  if (result.emailNotificationId) {
    void publishEmailNotificationSafely(result.emailNotificationId)
  }

  return result.order
}

export async function fulfillOrder(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const completedAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
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

    if (order.fulfillmentStatus !== 'DISPATCHED') {
      throw new OrderLifecycleError(
        'ORDER_NOT_DISPATCHED',
        'Only dispatched Orders can complete Fulfillment.'
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

export async function dispatchOrder(
  db: Db,
  input: { orderId: string; trackingNumber?: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const dispatchedAt = nowFromDeps(deps)
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber)

  const result = await db.$transaction(async (tx) => {
    const order = await findOrder(tx, input.orderId)

    if (order.fulfillmentStatus === 'DISPATCHED') {
      return { order, emailNotificationId: null }
    }

    if (order.status === 'CANCELLED') {
      throw new OrderLifecycleError(
        'ORDER_CANCELLED',
        'Cancelled Orders cannot be dispatched.'
      )
    }

    if (order.fulfillmentStatus !== 'UNFULFILLED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_FULFILLED',
        'Only unfulfilled Orders can be dispatched.'
      )
    }

    if (order.paymentStatus !== 'PAID') {
      throw new OrderLifecycleError(
        'ORDER_PAYMENT_NOT_PAID',
        'Only paid Orders can be dispatched.'
      )
    }

    const dispatchedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: 'DISPATCHED',
        dispatchCarrier: SWISS_POST_CARRIER_CODE,
        trackingNumber,
        dispatchedAt
      },
      include: orderListInclude
    })

    const emailNotification = await tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_DISPATCHED',
          recipientEmail: order.customerEmail
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_DISPATCHED',
          recipientEmail: order.customerEmail
        }),
        orderId: order.id,
        type: 'ORDER_DISPATCHED',
        recipientEmail: order.customerEmail,
        accessExpiresAt: order.customer.userId
          ? null
          : getOrderAccessExpiry(dispatchedAt)
      },
      update: {}
    })

    return {
      order: dispatchedOrder,
      emailNotificationId: emailNotification.id
    }
  })

  if (result.emailNotificationId) {
    void publishEmailNotificationSafely(result.emailNotificationId)
  }

  return result.order
}

export async function expirePendingPaymentOrders(
  db: Db,
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow[]> {
  const cancelledAt = nowFromDeps(deps)
  const expiredOrders = await db.$transaction((tx) =>
    tx.order.findMany({
      where: {
        status: 'PLACED',
        paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: { lte: cancelledAt }
      },
      include: orderLifecycleInclude
    })
  )

  const cancelledOrders: OrderListRow[] = []

  for (const candidate of expiredOrders) {
    const claimed = await db.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: candidate.id,
          status: 'PLACED',
          paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
          fulfillmentStatus: 'UNFULFILLED',
          paymentExpiresAt: { lte: cancelledAt }
        },
        data: { paymentExpiryStartedAt: cancelledAt }
      })
      return claim.count === 1
    })

    if (!claimed) continue

    const activePayment = (candidate.payments ?? []).find(
      (payment) => payment.status === 'PENDING'
    )
    if (activePayment?.stripeCheckoutSessionId) {
      try {
        await expireStripeCheckoutSession(activePayment.stripeCheckoutSessionId)
      } catch {
        continue
      }
    }

    const cancelled = await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE
      `
      const order = await findOrder(tx, candidate.id)
      if (order.paymentStatus === 'PAID') {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentExpiryStartedAt: null }
        })
        return null
      }

      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: {
          status: 'CANCELLED',
          failureReason: 'Payment Window expired.'
        }
      })
      await releaseStockReservation(tx, order)
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'CANCELLED',
          paymentExpiryStartedAt: null,
          cancelledAt
        }
      })
      await projectOrderPaymentStatus(tx, order.id, cancelledAt)
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderListInclude
      })
    })

    if (cancelled) cancelledOrders.push(cancelled)
  }

  return cancelledOrders
}
